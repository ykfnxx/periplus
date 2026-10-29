import type { Prisma } from "@prisma/client"
import { prisma } from "@/modules/data/db/prisma"
import type {
  PlaceCandidate,
  PlaceCategory,
  PlaceCoordinate,
  PlaceEnrichmentTarget,
  PlaceProvider,
  PlaceQuality,
  PlaceSearchResult,
} from "@/lib/places/types"

type PlaceWithRelations = Prisma.PlaceGetPayload<{
  include: {
    aliases: true
    sources: true
    providerMatches: true
  }
}>

const sourceQualityConfidence: Record<Uppercase<PlaceQuality>, number> = {
  VERIFIED: 0.95,
  PROBABLE: 0.82,
  CANDIDATE: 0.65,
  NEEDS_REVIEW: 0.4,
}

function providerFromString(value: string): PlaceProvider {
  if (
    value === "amap" ||
    value === "fsq" ||
    value === "wikidata" ||
    value === "mct" ||
    value === "osm" ||
    value === "opentripmap" ||
    value === "rollinggo"
  ) {
    return value
  }
  return "periplus"
}

function toDatabaseCoordinateSystem(
  value: PlaceCoordinate["coordinateSystem"]
): "WGS84" | "GCJ02" | "BD09" {
  return value === "BD09LL" ? "BD09" : value
}

function fromDatabaseCoordinateSystem(
  value: "WGS84" | "GCJ02" | "BD09" | "LOCAL"
): PlaceCoordinate["coordinateSystem"] | null {
  if (value === "LOCAL") return null
  return value === "BD09" ? "BD09LL" : value
}

function coordinateFromPlace(place: PlaceWithRelations): PlaceCoordinate[] {
  const coordinates: PlaceCoordinate[] = []
  if (place.latGcj02 !== null && place.lngGcj02 !== null) {
    coordinates.push({
      provider: "amap",
      coordinateSystem: "GCJ02",
      lat: place.latGcj02,
      lng: place.lngGcj02,
      accuracy: "converted",
      source: "catalog",
    })
  }
  if (place.latWgs84 !== null && place.lngWgs84 !== null) {
    coordinates.push({
      provider: "periplus",
      coordinateSystem: "WGS84",
      lat: place.latWgs84,
      lng: place.lngWgs84,
      accuracy: "approximate",
      source: "catalog",
    })
  }
  for (const match of place.providerMatches) {
    const coordinateSystem = fromDatabaseCoordinateSystem(
      match.coordinateSystem
    )
    if (!coordinateSystem) continue
    coordinates.push({
      provider: providerFromString(match.provider),
      coordinateSystem,
      lat: match.lat,
      lng: match.lng,
      accuracy: "provider_poi",
      source: "provider_search",
    })
  }
  return coordinates
}

function placeToCandidate(place: PlaceWithRelations): PlaceCandidate {
  const aliases = place.aliases.map((alias) => alias.normalizedName)
  return {
    candidateId: `place-${place.id}`,
    placeId: place.id,
    provider: "periplus",
    name: place.name,
    normalizedName: place.normalizedName,
    aliases,
    category: place.category as PlaceCategory,
    address: place.address ?? undefined,
    countryCode: place.countryCode ?? undefined,
    province: place.province ?? undefined,
    city: place.city ?? undefined,
    district: place.district ?? undefined,
    coordinates: coordinateFromPlace(place),
    sources: [
      {
        provider: "periplus",
        providerId: place.id,
        confidence:
          sourceQualityConfidence[
            place.sourceQuality as Uppercase<PlaceQuality>
          ] ?? 0.65,
      },
      ...place.sources.map((source) => ({
        provider: providerFromString(source.provider),
        providerId: source.providerId,
        license: source.license,
        fetchedAt: source.fetchedAt.toISOString(),
      })),
    ],
    sourceConfidence:
      sourceQualityConfidence[place.sourceQuality as Uppercase<PlaceQuality>] ??
      0.65,
    fromLiveProvider: false,
  }
}

export class PlaceCatalogRepository {
  async findById(placeId: string): Promise<PlaceCandidate | null> {
    const place = await prisma.place.findUnique({
      where: { id: placeId },
      include: {
        aliases: true,
        sources: true,
        providerMatches: true,
      },
    })
    return place ? placeToCandidate(place) : null
  }

  async linkProviderMatch(placeId: string, result: PlaceSearchResult) {
    const source = result.sources.find(
      (candidateSource) => candidateSource.provider !== "periplus"
    )
    if (!source?.providerId) return

    await prisma.placeProviderMatch.upsert({
      where: {
        provider_providerId: {
          provider: source.provider,
          providerId: source.providerId,
        },
      },
      update: {
        placeId,
        confidence: result.confidence,
        coordinateSystem: toDatabaseCoordinateSystem(
          result.bestCoordinate.coordinateSystem
        ),
        lat: result.bestCoordinate.lat,
        lng: result.bestCoordinate.lng,
        address: result.address,
        matchedAt: new Date(),
      },
      create: {
        placeId,
        provider: source.provider,
        providerId: source.providerId,
        confidence: result.confidence,
        coordinateSystem: toDatabaseCoordinateSystem(
          result.bestCoordinate.coordinateSystem
        ),
        lat: result.bestCoordinate.lat,
        lng: result.bestCoordinate.lng,
        address: result.address,
      },
    })

    const coordinate = result.bestCoordinate
    await prisma.place.update({
      where: { id: placeId },
      data: {
        address: result.address,
        province: result.province,
        city: result.city,
        district: result.district,
        sourceQuality: result.confidence >= 0.9 ? "VERIFIED" : "PROBABLE",
        ...(coordinate.coordinateSystem === "GCJ02"
          ? { latGcj02: coordinate.lat, lngGcj02: coordinate.lng }
          : coordinate.coordinateSystem === "WGS84"
            ? { latWgs84: coordinate.lat, lngWgs84: coordinate.lng }
            : {}),
      },
    })
  }

  async listProviderEnrichmentTargets(
    provider: PlaceProvider,
    limit?: number
  ): Promise<PlaceEnrichmentTarget[]> {
    const places = await prisma.place.findMany({
      where: {
        sources: { some: { provider: "mct" } },
        providerMatches: { none: { provider } },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      ...(limit ? { take: limit } : {}),
    })
    return places.map((place) => ({ placeId: place.id, name: place.name }))
  }

  async persistMatchReview(
    placeId: string,
    result: PlaceSearchResult,
    reason: string
  ) {
    const source = result.sources.find(
      (candidateSource) => candidateSource.provider !== "periplus"
    )
    const queryHash = `provider-match:${placeId}:${source?.provider ?? "unknown"}`
    const data = {
      provider: source?.provider ?? result.bestCoordinate.provider,
      providerId: source?.providerId,
      queryHash,
      name: result.name,
      normalizedName: result.normalizedName,
      category: result.category,
      lat: result.bestCoordinate.lat,
      lng: result.bestCoordinate.lng,
      coordinateSystem: toDatabaseCoordinateSystem(
        result.bestCoordinate.coordinateSystem
      ),
      confidence: result.confidence,
      status: "PENDING_REVIEW",
      rawPayload: JSON.stringify({ placeId, result, reason }),
    }
    const existing = await prisma.rawPlaceCandidate.findFirst({
      where: {
        queryHash,
        provider: data.provider,
        providerId: data.providerId,
        status: "PENDING_REVIEW",
      },
    })
    const candidate = existing
      ? await prisma.rawPlaceCandidate.update({
          where: { id: existing.id },
          data,
        })
      : await prisma.rawPlaceCandidate.create({ data })
    return candidate.id
  }

  async listMatchReviews(status = "PENDING_REVIEW") {
    return prisma.rawPlaceCandidate.findMany({
      where: {
        status,
        queryHash: { startsWith: "provider-match:" },
      },
      orderBy: [{ confidence: "desc" }, { createdAt: "asc" }],
    })
  }

  async reviewMatchCandidate(id: string, approved: boolean) {
    const candidate = await prisma.rawPlaceCandidate.findUnique({
      where: { id },
    })
    if (!candidate) throw new Error("待复核地点候选不存在")
    const payload = JSON.parse(candidate.rawPayload ?? "{}") as {
      placeId?: string
      result?: PlaceSearchResult
    }
    if (!payload.placeId || !payload.result) {
      throw new Error("待复核地点候选缺少标准地点或匹配结果")
    }
    if (approved) await this.linkProviderMatch(payload.placeId, payload.result)
    await prisma.rawPlaceCandidate.update({
      where: { id },
      data: { status: approved ? "APPROVED" : "REJECTED" },
    })
    return {
      placeId: payload.placeId,
      status: approved ? "APPROVED" : "REJECTED",
    }
  }
}
