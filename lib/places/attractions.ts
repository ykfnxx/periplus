import type {
  NormalizedPlaceQuery,
  PlaceCategory,
  PlaceSearchInput,
} from "./types"

const attractionCategories: PlaceCategory[] = [
  "SIGHT",
  "PARK",
  "MUSEUM",
  "CULTURE",
]

export function isAttractionCategory(category: PlaceCategory) {
  return attractionCategories.includes(category)
}

export function isAttractionSearch(
  query: Pick<NormalizedPlaceQuery | PlaceSearchInput, "categories" | "intent">
) {
  return (
    query.intent === "sightseeing" ||
    Boolean(query.categories?.some(isAttractionCategory))
  )
}
