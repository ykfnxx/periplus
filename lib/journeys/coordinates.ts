import type { TransitPlanEndpoint, TransitPlanRequest } from "./planning"

const PI = Math.PI
const A = 6378245
const EE = 0.00669342162296594323

export function endpointToGcj02(
  endpoint: TransitPlanEndpoint
): TransitPlanEndpoint {
  assertTransitEndpoint(endpoint)
  const system = endpoint.coordinateSystem?.toUpperCase() ?? "GCJ02"
  if (system === "GCJ02") return { ...endpoint, coordinateSystem: "GCJ02" }
  if (system === "WGS84") {
    const [lng, lat] = wgs84ToGcj02(endpoint.lng, endpoint.lat)
    return { ...endpoint, lng, lat, coordinateSystem: "GCJ02" }
  }
  if (system === "BD09LL") {
    const [lng, lat] = bd09ToGcj02(endpoint.lng, endpoint.lat)
    return { ...endpoint, lng, lat, coordinateSystem: "GCJ02" }
  }
  throw new Error(`Unsupported coordinate system: ${system}`)
}

export function canonicalizeTransitPlanRequest(
  request: TransitPlanRequest
): TransitPlanRequest {
  return {
    ...request,
    origin: endpointToGcj02(request.origin),
    destination: endpointToGcj02(request.destination),
  }
}

function assertTransitEndpoint(endpoint: TransitPlanEndpoint) {
  if (
    !Number.isFinite(endpoint.lat) ||
    !Number.isFinite(endpoint.lng) ||
    endpoint.lat < -90 ||
    endpoint.lat > 90 ||
    endpoint.lng < -180 ||
    endpoint.lng > 180
  ) {
    throw new Error(`Invalid Transit endpoint coordinates for ${endpoint.name}`)
  }
}

export function bd09ToGcj02(lng: number, lat: number): [number, number] {
  const x = lng - 0.0065
  const y = lat - 0.006
  const z = Math.sqrt(x * x + y * y) - 0.00002 * Math.sin(y * PI)
  const theta = Math.atan2(y, x) - 0.000003 * Math.cos(x * PI)
  return [z * Math.cos(theta), z * Math.sin(theta)]
}

export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  if (outsideChina(lng, lat)) return [lng, lat]
  const dLat = transformLat(lng - 105, lat - 35)
  const dLng = transformLng(lng - 105, lat - 35)
  const radLat = (lat / 180) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  const latOffset = (dLat * 180) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI)
  const lngOffset = (dLng * 180) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  return [lng + lngOffset, lat + latOffset]
}

function outsideChina(lng: number, lat: number) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(lng: number, lat: number) {
  let value =
    -100 +
    2 * lng +
    3 * lat +
    0.2 * lat * lat +
    0.1 * lng * lat +
    0.2 * Math.sqrt(Math.abs(lng))
  value += ((20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2) / 3
  value += ((20 * Math.sin(lat * PI) + 40 * Math.sin((lat / 3) * PI)) * 2) / 3
  value +=
    ((160 * Math.sin((lat / 12) * PI) + 320 * Math.sin((lat * PI) / 30)) * 2) /
    3
  return value
}

function transformLng(lng: number, lat: number) {
  let value =
    300 +
    lng +
    2 * lat +
    0.1 * lng * lng +
    0.1 * lng * lat +
    0.1 * Math.sqrt(Math.abs(lng))
  value += ((20 * Math.sin(6 * lng * PI) + 20 * Math.sin(2 * lng * PI)) * 2) / 3
  value += ((20 * Math.sin(lng * PI) + 40 * Math.sin((lng / 3) * PI)) * 2) / 3
  value +=
    ((150 * Math.sin((lng / 12) * PI) + 300 * Math.sin((lng / 30) * PI)) * 2) /
    3
  return value
}
