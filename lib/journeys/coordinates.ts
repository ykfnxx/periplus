import type { TransitPlanEndpoint, TransitPlanRequest } from "./planning"

import gcoord from "gcoord"

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
  if (system === "BD09LL" || system === "BD09") {
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
  return gcoord.transform([lng, lat], gcoord.BD09, gcoord.GCJ02)
}

export function wgs84ToGcj02(lng: number, lat: number): [number, number] {
  return gcoord.transform([lng, lat], gcoord.WGS84, gcoord.GCJ02)
}

export function gcj02ToWgs84(lng: number, lat: number): [number, number] {
  return gcoord.transform([lng, lat], gcoord.GCJ02, gcoord.WGS84)
}

export function coordinateToWgs84(
  lng: number,
  lat: number,
  system: "WGS84" | "GCJ02" | "BD09"
): [number, number] {
  return gcoord.transform([lng, lat], gcoord[system], gcoord.WGS84)
}
