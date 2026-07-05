import type {
  CoordinateSystem,
  NormalizedPlaceQuery,
  PlaceCoordinate,
} from "./types"

export function parseLngLat(
  value: string
): { lng: number; lat: number } | null {
  const [rawLng, rawLat] = value.split(",")
  const lng = Number(rawLng)
  const lat = Number(rawLat)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { lng, lat }
}

export function coordinateDistanceMeters(
  a: Pick<PlaceCoordinate, "lat" | "lng">,
  b: Pick<PlaceCoordinate, "lat" | "lng">
) {
  const earthRadiusMeters = 6371000
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h))
}

function preferredSystem(query: NormalizedPlaceQuery): CoordinateSystem {
  if (query.coordinatePreference === "wgs84") return "WGS84"
  return "GCJ02"
}

function coordinateScore(
  coordinate: PlaceCoordinate,
  query: NormalizedPlaceQuery
) {
  let score = coordinate.coordinateSystem === preferredSystem(query) ? 4 : 0
  if (
    coordinate.provider === "amap" &&
    query.coordinatePreference !== "wgs84"
  ) {
    score += 3
  }
  if (
    coordinate.accuracy === "provider_poi" ||
    coordinate.accuracy === "exact"
  ) {
    score += 2
  }
  if (coordinate.source === "catalog") score += 1
  return score
}

export function selectBestCoordinate(
  coordinates: PlaceCoordinate[],
  query: NormalizedPlaceQuery
) {
  return [...coordinates].sort(
    (a, b) => coordinateScore(b, query) - coordinateScore(a, query)
  )[0]
}
