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
  | "amap"
  | "fsq"
  | "wikidata"
  | "mct"
  | "osm"
  | "opentripmap"

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
  source: "catalog" | "provider_search" | "provider_convert" | "import"
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

export interface ProviderWarning {
  provider: PlaceProvider
  code: "timeout" | "quota_exceeded" | "provider_error" | "low_confidence"
  message: string
}

export interface PlaceSearchResponse {
  results: PlaceSearchResult[]
  warnings: ProviderWarning[]
}

export interface PlaceResolveInput {
  text: string
  city?: string
  intent?: PlaceSearchIntent
  journeyContext?: {
    currentCity?: string
    nearbyEventIds?: string[]
  }
  requireExact?: boolean
}

export interface PlaceResolveForJourneyEventInput extends PlaceResolveInput {
  eventId: string
}

export type PlaceResolveForJourneyEventResult =
  | {
      status: "ready"
      place: PlaceSearchResult
      command: {
        name: "journey.update_event"
        payload: {
          eventId: string
          patch: {
            type: "VISIT" | "STAY" | "MEAL" | "ACTIVITY"
            detail: {
              plannedPlaceId?: string
              plannedLat: number
              plannedLng: number
              coordinateSystem: CoordinateSystem
              coordinateProvider?: string
              providerPlaceId?: string
              providerCoverImage?: {
                provider: "amap"
                url: string
                fetchedAt: string
              }
            }
          }
        }
      }
      warnings: ProviderWarning[]
    }
  | Exclude<PlaceResolveResult, { status: "resolved" }>

export type PlaceResolveResult =
  | {
      status: "resolved"
      place: PlaceSearchResult
      warnings: ProviderWarning[]
    }
  | {
      status: "ambiguous"
      candidates: PlaceSearchResult[]
      question: string
      warnings: ProviderWarning[]
    }
  | {
      status: "not_found"
      fallbackQuery: PlaceSearchInput
      reason: string
      warnings: ProviderWarning[]
    }

export interface PlaceEnrichInput {
  placeId?: string
  provider?: PlaceProvider
  providerId?: string
  fields: Array<
    "coordinates" | "aliases" | "description" | "provider_match" | "categories"
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
