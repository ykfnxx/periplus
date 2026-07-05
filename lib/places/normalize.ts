import type {
  NormalizedPlaceQuery,
  PlaceCategory,
  PlaceSearchInput,
  PlaceSearchIntent,
} from "./types"

const intentCategories: Record<PlaceSearchIntent, PlaceCategory[]> = {
  sightseeing: ["SIGHT", "PARK", "MUSEUM", "CULTURE"],
  walkable: ["PARK", "SIGHT", "CULTURE"],
  museum: ["MUSEUM", "CULTURE"],
  performance: ["PERFORMANCE", "ENTERTAINMENT", "CULTURE"],
  family: ["PARK", "MUSEUM", "ENTERTAINMENT", "SIGHT"],
  food: ["RESTAURANT"],
  hotel: ["HOTEL"],
}

export function normalizePlaceName(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[·•・]/g, "")
    .replace(/\s+/g, "")
}

function uniqueCategories(categories: PlaceCategory[]) {
  return Array.from(new Set(categories))
}

function clampLimit(limit: number | undefined) {
  if (!limit) return 8
  return Math.min(Math.max(Math.trunc(limit), 1), 20)
}

function inferCategories(
  inputCategories: PlaceCategory[] | undefined,
  intent: PlaceSearchIntent | undefined
) {
  return uniqueCategories([
    ...(inputCategories ?? []),
    ...(intent ? intentCategories[intent] : []),
  ])
}

export function normalizePlaceSearchInput(
  input: PlaceSearchInput
): NormalizedPlaceQuery {
  const query = input.query?.trim()
  const city = input.city?.trim()

  return {
    ...input,
    query: query || undefined,
    city: city || undefined,
    normalizedQuery: query ? normalizePlaceName(query) : undefined,
    normalizedCity: city ? normalizePlaceName(city) : undefined,
    categories: inferCategories(input.categories, input.intent),
    limit: clampLimit(input.limit),
    includeLiveProvider: input.includeLiveProvider ?? false,
    coordinatePreference: input.coordinatePreference ?? "auto",
  }
}
