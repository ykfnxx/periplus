import { canonicalizeTransitPlanRequest } from "./coordinates"
import type { JourneyEvent } from "@/modules/data-model/contracts"
export type TransportMode = NonNullable<
  JourneyEvent["transit"]
>["transportMode"]
export type TransitRequestMode = NonNullable<
  NonNullable<JourneyEvent["transit"]>["requestMode"]
>
export type TransitPreference = NonNullable<
  NonNullable<JourneyEvent["transit"]>["preference"]
>
export interface TransitPlanEndpoint {
  name: string
  lat: number
  lng: number
  coordinateSystem?: string
  providerPlaceId?: string
  cityCode?: string
}

export interface TransitPlanRequest {
  transitEventId: string
  origin: TransitPlanEndpoint
  destination: TransitPlanEndpoint
  mode: TransitRequestMode
  transportMode?: TransportMode
  departAt?: string
  preference: TransitPreference
  alternatives: number
}

const TRANSIT_PLANNING_VERSION = 3

export function requestModeForTransport(
  transportMode?: TransportMode
): TransitRequestMode | null {
  if (transportMode === "WALK") return "WALK"
  if (
    transportMode === "BUS" ||
    transportMode === "SUBWAY" ||
    transportMode === "TRAIN"
  ) {
    return "TRANSIT"
  }
  if (
    transportMode === "CAR" ||
    transportMode === "TAXI" ||
    transportMode === "RENTAL"
  ) {
    return "DRIVE"
  }
  return null
}

export function buildTransitPlanRequest(
  event: JourneyEvent,
  events: readonly JourneyEvent[]
): TransitPlanRequest | null {
  const detail = event.transit
  if (!detail) return null
  const endpoint = (id: string): TransitPlanEndpoint | null => {
    const value = events.find((event) => event.id === id)
    if (!value?.location?.coordinates) return null
    return {
      name: value.location.name,
      ...value.location.coordinates,
      ...(value.planning?.provider === "amap"
        ? { providerPlaceId: value.planning.providerPlaceId }
        : {}),
    }
  }
  const origin = endpoint(detail.fromEventId),
    destination = endpoint(detail.toEventId),
    mode = detail.requestMode ?? requestModeForTransport(detail.transportMode)
  if (!origin || !destination || !mode) return null
  return {
    transitEventId: event.id,
    origin,
    destination,
    mode,
    transportMode: detail.transportMode,
    departAt: event.planning?.startAt,
    preference: detail.preference ?? "RECOMMENDED",
    alternatives: 3,
  }
}

export function transitPlanFingerprint(request: TransitPlanRequest) {
  const normalized = {
    version: TRANSIT_PLANNING_VERSION,
    origin: endpointFingerprint(request.origin),
    destination: endpointFingerprint(request.destination),
    mode: request.mode,
    transportMode: request.transportMode ?? null,
    departAt: request.departAt ?? null,
    preference: request.preference,
    alternatives: request.alternatives,
  }
  return stableHash(JSON.stringify(normalized))
}

function stableHash(value: string) {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`
}

function endpointFingerprint(endpoint: TransitPlanEndpoint) {
  return {
    lat: Math.round(endpoint.lat * 1e6) / 1e6,
    lng: Math.round(endpoint.lng * 1e6) / 1e6,
    coordinateSystem: endpoint.coordinateSystem ?? "GCJ02",
    providerPlaceId: endpoint.providerPlaceId ?? null,
    cityCode: endpoint.cityCode ?? null,
  }
}

export function routeMatchesCurrent(
  event: JourneyEvent,
  events: readonly JourneyEvent[]
) {
  const route = event.transit?.route,
    request = buildTransitPlanRequest(event, events)
  if (!route || !request) return false
  try {
    return (
      route.requestFingerprint ===
      transitPlanFingerprint(canonicalizeTransitPlanRequest(request))
    )
  } catch {
    return false
  }
}
