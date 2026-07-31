import { plannedLocationOf } from "./locations"
import type {
  JourneyDocument,
  JourneyEvent,
  TransitEvent,
  TransitPlan,
  TransitPreference,
  TransitRequestMode,
  TransportMode,
} from "@/types/journey"

export type TransitProviderErrorCode =
  | "INVALID_ENDPOINT"
  | "NO_ROUTE"
  | "AUTH_OR_QUOTA"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "MALFORMED_RESPONSE"

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

export interface TransitPlanBundle {
  transitEventId: string
  requestFingerprint: string
  plans: TransitPlan[]
  warning?: string
}

export interface TransitPlanFailure {
  transitEventId: string
  code: TransitProviderErrorCode
  message: string
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
  event: TransitEvent,
  events: readonly JourneyEvent[]
): TransitPlanRequest | null {
  const eventById = new Map(
    events.map((candidate) => [candidate.id, candidate])
  )
  const from = plannedLocationOf(
    eventById.get(event.detail.plannedFromEventId ?? "")
  )
  const to = plannedLocationOf(
    eventById.get(event.detail.plannedToEventId ?? "")
  )
  if (!from || !to) return null

  const mode =
    event.detail.requestMode ??
    requestModeForTransport(event.detail.transportMode)
  if (!mode) return null
  return {
    transitEventId: event.id,
    origin: {
      name: from.name,
      lat: from.lat,
      lng: from.lng,
      coordinateSystem: from.coordinateSystem,
      providerPlaceId:
        from.coordinateProvider?.toLowerCase() === "amap"
          ? from.providerPlaceId
          : undefined,
    },
    destination: {
      name: to.name,
      lat: to.lat,
      lng: to.lng,
      coordinateSystem: to.coordinateSystem,
      providerPlaceId:
        to.coordinateProvider?.toLowerCase() === "amap"
          ? to.providerPlaceId
          : undefined,
    },
    mode,
    transportMode: event.detail.transportMode,
    departAt: event.detail.plannedDepartAt,
    preference: event.detail.preference ?? "RECOMMENDED",
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

export function selectedTransitPlan(event: TransitEvent) {
  if (!event.detail.plans?.length) return undefined
  return (
    event.detail.plans.find(
      (plan) => plan.id === event.detail.selectedPlanId
    ) ?? event.detail.plans[0]
  )
}

export function applyTransitPlanBundle(
  event: TransitEvent,
  bundle: TransitPlanBundle
): TransitEvent {
  if (bundle.transitEventId !== event.id) return event
  const selectedPlanId = bundle.plans.some(
    (plan) => plan.id === event.detail.selectedPlanId
  )
    ? event.detail.selectedPlanId
    : bundle.plans[0]?.id
  const selected =
    bundle.plans.find((plan) => plan.id === selectedPlanId) ?? bundle.plans[0]
  return {
    ...event,
    detail: {
      ...event.detail,
      plans: bundle.plans,
      selectedPlanId,
      planningFingerprint: bundle.requestFingerprint,
      planningStatus: bundle.plans.length ? "READY" : "FAILED",
      planningWarning: bundle.warning,
      plannedDurationMinutes: selected
        ? Math.max(1, Math.round(selected.durationSeconds / 60))
        : event.detail.plannedDurationMinutes,
      plannedDistanceKm: selected
        ? Math.round((selected.distanceMeters / 1000) * 10) / 10
        : event.detail.plannedDistanceKm,
      plannedCostEstimate:
        selected?.fareAmount ?? event.detail.plannedCostEstimate,
    },
  }
}

export function mergeWorkspaceTransitPlans<T extends JourneyDocument>(
  previous: T | null,
  incoming: T | null
): T | null {
  if (!previous || !incoming) return incoming
  const oldById = new Map(previous.events.map((event) => [event.id, event]))
  return {
    ...incoming,
    events: incoming.events.map((event) => {
      if (event.type !== "TRANSIT" || event.detail.plans?.length) return event
      const old = oldById.get(event.id)
      if (!old || old.type !== "TRANSIT" || !old.detail.plans?.length) {
        return event
      }
      const request = buildTransitPlanRequest(event, incoming.events)
      if (!request) return event
      const currentFingerprint = transitPlanFingerprint(request)
      return {
        ...event,
        detail: {
          ...event.detail,
          plans: old.detail.plans,
          selectedPlanId: old.detail.selectedPlanId,
          planningFingerprint: old.detail.planningFingerprint,
          planningWarning: old.detail.planningWarning,
          planningStatus:
            old.detail.planningFingerprint === currentFingerprint
              ? "READY"
              : "STALE",
          plannedDurationMinutes: old.detail.plannedDurationMinutes,
          plannedDistanceKm: old.detail.plannedDistanceKm,
          plannedCostEstimate: old.detail.plannedCostEstimate,
        },
      }
    }),
  }
}
