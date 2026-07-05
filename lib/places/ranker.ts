import { coordinateDistanceMeters, selectBestCoordinate } from "./coordinates"
import type {
  NormalizedPlaceQuery,
  PlaceCandidate,
  PlaceQuality,
  PlaceSearchResult,
} from "./types"

function textSimilarity(query: string | undefined, candidate: PlaceCandidate) {
  if (!query) return 0.65
  if (candidate.normalizedName === query) return 1
  if (candidate.aliases.some((alias) => alias === query)) return 0.96
  if (
    candidate.normalizedName.includes(query) ||
    query.includes(candidate.normalizedName)
  ) {
    return 0.82
  }
  if (
    candidate.aliases.some(
      (alias) => alias.includes(query) || query.includes(alias)
    )
  ) {
    return 0.78
  }
  return 0.45
}

function locationScore(query: NormalizedPlaceQuery, candidate: PlaceCandidate) {
  let score = 0.5
  if (query.city && candidate.city?.includes(query.city)) score += 0.25
  if (
    query.adcode &&
    candidate.sources.some((source) => source.providerId === query.adcode)
  ) {
    score += 0.1
  }
  if (query.near && candidate.coordinates.length) {
    const distance = Math.min(
      ...candidate.coordinates.map((coordinate) =>
        coordinateDistanceMeters(query.near!, coordinate)
      )
    )
    if (distance <= (query.radiusMeters ?? 3000)) score += 0.25
    else if (distance <= 10000) score += 0.1
  }
  return Math.min(score, 1)
}

function categoryScore(query: NormalizedPlaceQuery, candidate: PlaceCandidate) {
  if (!query.categories.length) return 0.75
  return query.categories.includes(candidate.category) ? 1 : 0.45
}

function coordinateScore(candidate: PlaceCandidate) {
  if (!candidate.coordinates.length) return 0
  if (
    candidate.coordinates.some(
      (coordinate) =>
        coordinate.accuracy === "provider_poi" ||
        coordinate.accuracy === "exact"
    )
  ) {
    return 1
  }
  if (
    candidate.coordinates.some(
      (coordinate) => coordinate.accuracy === "converted"
    )
  ) {
    return 0.82
  }
  return 0.6
}

function sourceScore(candidate: PlaceCandidate) {
  const providerWeight = candidate.sources.reduce((score, source) => {
    if (source.provider === "periplus") return Math.max(score, 1)
    if (source.provider === "mct") return Math.max(score, 0.96)
    if (source.provider === "fsq" || source.provider === "wikidata") {
      return Math.max(score, 0.86)
    }
    if (source.provider === "amap") return Math.max(score, 0.8)
    return score
  }, 0.6)
  return Math.max(providerWeight, candidate.sourceConfidence)
}

function confidenceFor(query: NormalizedPlaceQuery, candidate: PlaceCandidate) {
  return (
    textSimilarity(query.normalizedQuery, candidate) * 0.3 +
    locationScore(query, candidate) * 0.25 +
    categoryScore(query, candidate) * 0.15 +
    sourceScore(candidate) * 0.2 +
    coordinateScore(candidate) * 0.1
  )
}

function qualityFor(confidence: number): PlaceQuality {
  if (confidence >= 0.9) return "verified"
  if (confidence >= 0.78) return "probable"
  if (confidence >= 0.55) return "candidate"
  return "needs_review"
}

function mergeKey(candidate: PlaceCandidate) {
  if (candidate.placeId) return `place:${candidate.placeId}`
  if (candidate.providerId)
    return `provider:${candidate.provider}:${candidate.providerId}`
  return `name:${candidate.normalizedName}:${candidate.city ?? ""}:${candidate.district ?? ""}`
}

function mergeCandidates(candidates: PlaceCandidate[]) {
  const groups = new Map<string, PlaceCandidate>()
  for (const candidate of candidates) {
    const key = mergeKey(candidate)
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, candidate)
      continue
    }

    groups.set(key, {
      ...existing,
      aliases: Array.from(new Set([...existing.aliases, ...candidate.aliases])),
      coordinates: [...existing.coordinates, ...candidate.coordinates],
      sources: [...existing.sources, ...candidate.sources],
      sourceConfidence: Math.max(
        existing.sourceConfidence,
        candidate.sourceConfidence
      ),
      fromLiveProvider: existing.fromLiveProvider || candidate.fromLiveProvider,
      address: existing.address ?? candidate.address,
      province: existing.province ?? candidate.province,
      city: existing.city ?? candidate.city,
      district: existing.district ?? candidate.district,
    })
  }
  return Array.from(groups.values())
}

function actionability(
  quality: PlaceQuality,
  candidate: PlaceCandidate,
  query: NormalizedPlaceQuery
) {
  const bestCoordinate = selectBestCoordinate(candidate.coordinates, query)
  const coordinateMatches =
    query.coordinatePreference === "wgs84"
      ? bestCoordinate?.coordinateSystem === "WGS84"
      : bestCoordinate?.coordinateSystem === "GCJ02"

  const canAddToRoute =
    Boolean(bestCoordinate) &&
    coordinateMatches &&
    (quality === "verified" || quality === "probable")

  const needsUserConfirmation =
    quality !== "verified" ||
    (candidate.fromLiveProvider &&
      !candidate.sources.some((source) => source.provider === "periplus"))

  return { bestCoordinate, canAddToRoute, needsUserConfirmation }
}

export function rankPlaceCandidates(
  query: NormalizedPlaceQuery,
  candidates: PlaceCandidate[]
): PlaceSearchResult[] {
  function toSearchResult(candidate: PlaceCandidate): PlaceSearchResult | null {
    const confidence = confidenceFor(query, candidate)
    const quality = qualityFor(confidence)
    const { bestCoordinate, canAddToRoute, needsUserConfirmation } =
      actionability(quality, candidate, query)

    if (!bestCoordinate) return null

    const result: PlaceSearchResult = {
      id: candidate.candidateId,
      name: candidate.name,
      normalizedName: candidate.normalizedName,
      aliases: candidate.aliases,
      category: candidate.category,
      address: candidate.address,
      countryCode: candidate.countryCode,
      province: candidate.province,
      city: candidate.city,
      district: candidate.district,
      coordinates: candidate.coordinates,
      bestCoordinate,
      sources: candidate.sources,
      confidence: Number(confidence.toFixed(3)),
      quality,
      canAddToRoute,
      needsUserConfirmation,
      reason:
        quality === "verified"
          ? "本地来源或 provider 匹配置信度较高"
          : "结果需要用户确认或更多来源校验",
    }
    if (candidate.placeId) result.placeId = candidate.placeId
    return result
  }

  return mergeCandidates(candidates)
    .map(toSearchResult)
    .filter((result): result is PlaceSearchResult => Boolean(result))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, query.limit)
}
