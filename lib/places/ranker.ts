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
  return `candidate:${candidate.provider}:${candidate.candidateId}`
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
      ...(candidate.placeId && !existing.placeId ? candidate : existing),
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
      images: existing.images?.length ? existing.images : candidate.images,
    })
  }
  return Array.from(groups.values())
}

function actionability(candidate: PlaceCandidate, query: NormalizedPlaceQuery) {
  const bestCoordinate = selectBestCoordinate(candidate.coordinates, query)
  const hasName = candidate.name.trim().length > 0
  const coordinateIsUsable = Boolean(
    bestCoordinate &&
    Number.isFinite(bestCoordinate.lat) &&
    Number.isFinite(bestCoordinate.lng) &&
    bestCoordinate.lat >= -90 &&
    bestCoordinate.lat <= 90 &&
    bestCoordinate.lng >= -180 &&
    bestCoordinate.lng <= 180 &&
    ["WGS84", "GCJ02", "BD09LL"].includes(bestCoordinate.coordinateSystem)
  )
  const trustedSource = candidate.sources.length > 0
  const canAddToJourney = hasName && coordinateIsUsable && trustedSource

  return {
    bestCoordinate,
    canAddToJourney,
    needsUserConfirmation: false,
  }
}

export function rankPlaceCandidates(
  query: NormalizedPlaceQuery,
  candidates: PlaceCandidate[]
): PlaceSearchResult[] {
  function toSearchResult(candidate: PlaceCandidate): PlaceSearchResult | null {
    const confidence = confidenceFor(query, candidate)
    const quality = qualityFor(confidence)
    const { bestCoordinate, canAddToJourney, needsUserConfirmation } =
      actionability(candidate, query)

    if (!bestCoordinate || !canAddToJourney) return null

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
      images: candidate.images,
      coordinates: candidate.coordinates,
      bestCoordinate,
      sources: candidate.sources,
      confidence: Number(confidence.toFixed(3)),
      quality,
      canAddToJourney,
      needsUserConfirmation,
      reason: "名称、坐标与可信来源均满足 AUTO 写入门槛",
    }
    if (candidate.placeId) result.placeId = candidate.placeId
    return result
  }

  return mergeCandidates(candidates)
    .map((candidate, providerOrder) => ({
      result: toSearchResult(candidate),
      providerOrder,
    }))
    .filter(
      (entry): entry is { result: PlaceSearchResult; providerOrder: number } =>
        Boolean(entry.result)
    )
    .sort(
      (a, b) =>
        b.result.confidence - a.result.confidence ||
        a.providerOrder - b.providerOrder ||
        a.result.id.localeCompare(b.result.id)
    )
    .map((entry) => entry.result)
    .slice(0, query.limit)
}
