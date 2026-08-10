export const PLACE_CATEGORIES = [
  "SIGHT",
  "PARK",
  "MUSEUM",
  "CULTURE",
  "PERFORMANCE",
  "SPORTS",
  "ENTERTAINMENT",
  "RESTAURANT",
  "HOTEL",
  "TRANSIT",
  "OTHER",
] as const

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number]

export const COORDINATE_SYSTEMS = ["WGS84", "GCJ02", "BD09LL"] as const
export type CoordinateSystem = (typeof COORDINATE_SYSTEMS)[number]

export type PlaceProvider =
  | "periplus"
  | "agent_fallback"
  | "amap"
  | "fsq"
  | "wikidata"
  | "mct"
  | "osm"
  | "opentripmap"
  | "rollinggo"

export type PlaceQuality =
  | "verified"
  | "probable"
  | "candidate"
  | "needs_review"

export const PLACE_SEARCH_INTENTS = [
  "sightseeing",
  "walkable",
  "museum",
  "performance",
  "family",
  "food",
  "hotel",
] as const

export type PlaceSearchIntent = (typeof PLACE_SEARCH_INTENTS)[number]

export interface PlaceSearchInput {
  query?: string
  city?: string
  adcode?: string
  categories?: PlaceCategory[]
  intent?: PlaceSearchIntent
  near?: {
    lat: number
    lng: number
    coordinateSystem: CoordinateSystem
  }
  radiusMeters?: number
  limit?: number
  includeLiveProvider?: boolean
  coordinatePreference?: "amap" | "wgs84" | "auto"
}

export interface NormalizedPlaceQuery extends PlaceSearchInput {
  normalizedQuery?: string
  normalizedCity?: string
  categories: PlaceCategory[]
  limit: number
  includeLiveProvider: boolean
  coordinatePreference: "amap" | "wgs84" | "auto"
}

export interface PlaceCoordinate {
  provider: PlaceProvider
  coordinateSystem: CoordinateSystem
  lat: number
  lng: number
  accuracy?: "exact" | "provider_poi" | "converted" | "approximate"
  source:
    | "catalog"
    | "provider_search"
    | "provider_convert"
    | "web_search"
    | "import"
}

export interface PlaceResultSource {
  provider: PlaceProvider
  providerId?: string
  license?: string
  confidence?: number
  fetchedAt?: string
}

export interface PlaceImage {
  provider: PlaceProvider
  url: string
  title?: string
  fetchedAt: string
  width?: number
  height?: number
}

export interface PlaceSearchResult {
  id: string
  placeId?: string
  name: string
  normalizedName: string
  aliases: string[]
  category: PlaceCategory
  address?: string
  countryCode?: string
  province?: string
  city?: string
  district?: string
  images?: PlaceImage[]
  coordinates: PlaceCoordinate[]
  bestCoordinate: PlaceCoordinate
  sources: PlaceResultSource[]
  confidence: number
  quality: PlaceQuality
  canAddToJourney: boolean
  needsUserConfirmation: boolean
  reason: string
}

export interface PlaceRef {
  provider: PlaceProvider
  providerId?: string
  canonicalName: string
  city?: string
  address?: string
  lat: number
  lng: number
  coordinateSystem: CoordinateSystem
  confidence: number
  candidates: Array<{
    id: string
    name: string
    city?: string
    confidence: number
  }>
}

export interface PlaceVerification {
  ref: PlaceRef
  coverImage?: PlaceImage
  verificationStatus?: "VERIFIED" | "UNVERIFIED"
  sourceUrls?: string[]
}

export interface ProviderWarning {
  provider: PlaceProvider
  code:
    | "timeout"
    | "rate_limited"
    | "quota_exceeded"
    | "provider_error"
    | "low_confidence"
    | "IMAGE_UNAVAILABLE"
    | "UNVERIFIED_FALLBACK"
  message: string
  image?: PlaceImage
  retryable?: boolean
  attempts?: number
  exhausted?: boolean
}

export interface PlaceSearchResponse {
  results: PlaceSearchResult[]
  warnings: ProviderWarning[]
  providerAttempts?: number
}

export interface PlaceResolveInput {
  text: string
  city?: string
  intent?: PlaceSearchIntent
  journeyContext?: {
    currentCity?: string
    nearbyEventIds?: string[]
  }
}

export type PlaceResolveResult =
  | {
      status: "resolved"
      place: PlaceSearchResult
      placeRef: PlaceRef
      warnings: ProviderWarning[]
      providerAttempts?: number
    }
  | {
      status: "ambiguous"
      candidates: PlaceSearchResult[]
      question: string
      warnings: ProviderWarning[]
      providerAttempts?: number
    }
  | {
      status: "not_found"
      fallbackQuery: PlaceSearchInput
      reason: string
      fallbackAllowed: boolean
      warnings: ProviderWarning[]
      providerAttempts?: number
    }

export interface PlaceEnrichInput {
  placeId?: string
  provider?: PlaceProvider
  providerId?: string
  fields: Array<
    | "coordinates"
    | "aliases"
    | "description"
    | "provider_match"
    | "categories"
    | "images"
  >
}

export interface PlaceEnrichResult extends PlaceSearchResponse {
  placeId?: string
  matchStatus: "AUTO_APPROVED" | "PENDING_REVIEW" | "NO_MATCH"
  reviewCandidateId?: string
  reason: string
}

export interface PlaceEnrichmentTarget {
  placeId: string
  name: string
}

export interface PlaceCandidate {
  candidateId: string
  placeId?: string
  provider: PlaceProvider
  providerId?: string
  name: string
  normalizedName: string
  aliases: string[]
  category: PlaceCategory
  address?: string
  countryCode?: string
  province?: string
  city?: string
  district?: string
  images?: PlaceImage[]
  coordinates: PlaceCoordinate[]
  sources: PlaceResultSource[]
  sourceConfidence: number
  fromLiveProvider: boolean
}

export interface LocalSearchResult {
  candidates: PlaceCandidate[]
  topConfidence: number
}

export interface ProviderPlan {
  useAmap: boolean
  writeBack: "none" | "cache_only" | "provider_match"
  reason: string
}
