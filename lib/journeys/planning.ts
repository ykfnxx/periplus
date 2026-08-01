import { plannedLocationOf } from "./locations"
import type {
  TargetJourneyEvent,
  TargetTransitPlanningRun,
} from "@/modules/data-model/contracts"

export type TransitProviderErrorCode =
  | "INVALID_ENDPOINT"
  | "NO_ROUTE"
  | "AUTH_OR_QUOTA"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "MALFORMED_RESPONSE"

export type TransportMode = Extract<
  TargetJourneyEvent,
  { type: "TRANSIT" }
>["detail"]["transportMode"]
export type TransitRequestMode = NonNullable<
  Extract<TargetJourneyEvent, { type: "TRANSIT" }>["detail"]["requestMode"]
>
export type TransitPreference = NonNullable<
  Extract<TargetJourneyEvent, { type: "TRANSIT" }>["detail"]["preference"]
>
export type TransitPlan = Omit<
  TargetTransitPlanningRun["plans"][number],
  "planningRunId" | "transitEventId"
> & { requestFingerprint: string }
export type TransitSegment = TransitPlan["segments"][number]
export type TransitSegmentMode = TransitSegment["mode"]
export type TransitTrafficBasis = TransitPlan["trafficBasis"]
export type TransitTrafficSection = NonNullable<
  TransitSegment["trafficSections"]
>[number]

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
  event: Extract<TargetJourneyEvent, { type: "TRANSIT" }>,
  events: readonly TargetJourneyEvent[]
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

export function activeTransitPlanningRun(
  event: Extract<TargetJourneyEvent, { type: "TRANSIT" }>,
  runs: readonly TargetTransitPlanningRun[]
) {
  return event.detail.activePlanningRunId
    ? runs.find((run) => run.id === event.detail.activePlanningRunId)
    : undefined
}

export function selectedTransitPlan(
  event: Extract<TargetJourneyEvent, { type: "TRANSIT" }>,
  runs: readonly TargetTransitPlanningRun[]
) {
  const run = activeTransitPlanningRun(event, runs)
  if (!run?.plans.length) return undefined
  return (
    run.plans.find((plan) => plan.id === event.detail.selectedPlanId) ??
    run.plans[0]
  )
}
