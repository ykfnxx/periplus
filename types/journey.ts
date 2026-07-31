export const JOURNEY_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED"] as const
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number]

export const JOURNEY_VISIBILITIES = ["private", "unlisted", "public"] as const
export type JourneyVisibility = (typeof JOURNEY_VISIBILITIES)[number]

export const JOURNEY_EVENT_TYPES = [
  "SECTION",
  "VISIT",
  "TRANSIT",
  "STAY",
  "MEAL",
  "ACTIVITY",
  "NOTE",
] as const
export type JourneyEventType = (typeof JOURNEY_EVENT_TYPES)[number]

export const JOURNEY_EVENT_EXECUTION_STATUSES = [
  "PLANNED",
  "STARTED",
  "CONFIRMED",
  "SKIPPED",
  "CANCELLED",
] as const
export type JourneyEventExecutionStatus =
  (typeof JOURNEY_EVENT_EXECUTION_STATUSES)[number]

export const JOURNEY_EVENT_ORIGINS = [
  "ORIGINAL",
  "USER_INSERTED",
  "AGENT_INSERTED",
  "FORKED",
  "SOURCE_DERIVED",
] as const
export type JourneyEventOrigin = (typeof JOURNEY_EVENT_ORIGINS)[number]

export const JOURNEY_EVENT_LINK_KINDS = ["MAIN", "ALTERNATIVE"] as const
export type JourneyEventLinkKind = (typeof JOURNEY_EVENT_LINK_KINDS)[number]

export const JOURNEY_SECTION_KINDS = ["CITY", "DAY", "THEME"] as const
export type JourneySectionKind = (typeof JOURNEY_SECTION_KINDS)[number]

export const TRANSPORT_MODES = [
  "FLIGHT",
  "TRAIN",
  "CAR",
  "BUS",
  "WALK",
  "TAXI",
  "SUBWAY",
  "RENTAL",
] as const
export type TransportMode = (typeof TRANSPORT_MODES)[number]

export const TRANSIT_REQUEST_MODES = ["DRIVE", "WALK", "TRANSIT"] as const
export type TransitRequestMode = (typeof TRANSIT_REQUEST_MODES)[number]

export const TRANSIT_PREFERENCES = [
  "RECOMMENDED",
  "FASTEST",
  "LOW_COST",
  "FEWER_TRANSFERS",
  "LESS_WALKING",
] as const
export type TransitPreference = (typeof TRANSIT_PREFERENCES)[number]

export const TRANSIT_PLANNING_STATUSES = [
  "EMPTY",
  "PLANNING",
  "READY",
  "STALE",
  "FAILED",
] as const
export type TransitPlanningStatus = (typeof TRANSIT_PLANNING_STATUSES)[number]

export const TRANSIT_TRAFFIC_BASES = [
  "REALTIME",
  "PREDICTED",
  "TYPICAL",
  "SCHEDULED",
] as const
export type TransitTrafficBasis = (typeof TRANSIT_TRAFFIC_BASES)[number]

export const TRANSIT_SEGMENT_MODES = [
  "WALK",
  "DRIVE",
  "BUS",
  "SUBWAY",
  "RAIL",
  "TAXI",
  "FLIGHT",
] as const
export type TransitSegmentMode = (typeof TRANSIT_SEGMENT_MODES)[number]

export const TRANSIT_GEOMETRY_KINDS = [
  "ROAD_NETWORK",
  "TRANSIT_LINE",
  "SCHEMATIC",
  "NONE",
] as const
export type TransitGeometryKind = (typeof TRANSIT_GEOMETRY_KINDS)[number]

export type JourneyLngLat = [number, number]

export interface TransitTrafficSection {
  status: "UNKNOWN" | "FREE_FLOW" | "SLOW" | "CONGESTED" | "SEVERE"
  positions: JourneyLngLat[]
}

export interface TransitSegment {
  id: string
  order: number
  mode: TransitSegmentMode
  fromName?: string
  toName?: string
  lineName?: string
  distanceMeters?: number
  durationSeconds?: number
  fareAmount?: number
  departAt?: string
  arriveAt?: string
  coordinateSystem: "GCJ02"
  geometryKind: TransitGeometryKind
  positions: JourneyLngLat[]
  trafficSections?: TransitTrafficSection[]
}

export interface TransitPlan {
  id: string
  provider: "amap" | "mock"
  rank: number
  label: string
  strategy: string
  distanceMeters: number
  durationSeconds: number
  fareAmount?: number
  trafficBasis: TransitTrafficBasis
  calculatedAt: string
  validUntil?: string
  requestFingerprint: string
  segments: TransitSegment[]
}

export interface JourneyEventBase {
  id: string
  journeyId?: string
  parentEventId?: string
  replacedByEventId?: string
  type: JourneyEventType
  origin: JourneyEventOrigin
  title: string
  description?: string
  plannedStartAt?: string
  plannedEndAt?: string
  actualStartAt?: string
  actualEndAt?: string
  createdAt?: string
  updatedAt?: string
}

export interface ExecutableJourneyEventBase extends JourneyEventBase {
  executionStatus: JourneyEventExecutionStatus
}

export interface JourneyLocationDetail {
  plannedPlaceId?: string
  actualPlaceId?: string
  plannedLat: number
  plannedLng: number
  actualLat?: number
  actualLng?: number
  coordinateSystem?: string
  coordinateProvider?: string
  providerPlaceId?: string
  plannedDurationMinutes?: number
  actualDurationMinutes?: number
}

export interface SectionEvent extends JourneyEventBase {
  type: "SECTION"
  executionStatus?: never
  detail: {
    kind: JourneySectionKind
    placeId?: string
    lat?: number
    lng?: number
    coordinateSystem?: string
    coordinateProvider?: string
    providerPlaceId?: string
  }
}

export interface VisitEvent extends ExecutableJourneyEventBase {
  type: "VISIT"
  detail: JourneyLocationDetail
}

export interface StayEvent extends ExecutableJourneyEventBase {
  type: "STAY"
  detail: JourneyLocationDetail & { checkInNote?: string }
}

export interface MealEvent extends ExecutableJourneyEventBase {
  type: "MEAL"
  detail: JourneyLocationDetail & { cuisine?: string }
}

export interface ActivityEvent extends ExecutableJourneyEventBase {
  type: "ACTIVITY"
  detail: JourneyLocationDetail & { bookingReference?: string }
}

export interface TransitEvent extends ExecutableJourneyEventBase {
  type: "TRANSIT"
  detail: {
    plannedFromEventId?: string
    plannedToEventId?: string
    actualFromEventId?: string
    actualToEventId?: string
    transportMode: TransportMode
    requestMode?: TransitRequestMode
    preference?: TransitPreference
    plannedDepartAt?: string
    actualDepartAt?: string
    plannedDurationMinutes?: number
    actualDurationMinutes?: number
    plannedDistanceKm?: number
    actualDistanceKm?: number
    plannedCostEstimate?: number
    actualCost?: number
    selectedPlanId?: string
    planningStatus?: TransitPlanningStatus
    planningFingerprint?: string
    planningWarning?: string
    notes?: string
    plans?: TransitPlan[]
  }
}

export interface NoteEvent extends JourneyEventBase {
  type: "NOTE"
  executionStatus?: never
  detail: { body: string }
}

export type JourneyEvent =
  | SectionEvent
  | VisitEvent
  | TransitEvent
  | StayEvent
  | MealEvent
  | ActivityEvent
  | NoteEvent

export type ExecutableJourneyEvent = Exclude<
  JourneyEvent,
  SectionEvent | NoteEvent
>

export type LocationJourneyEvent =
  | SectionEvent
  | VisitEvent
  | StayEvent
  | MealEvent
  | ActivityEvent

export interface JourneyEventLink {
  id: string
  journeyId?: string
  fromEventId: string
  toEventId: string
  kind: JourneyEventLinkKind
  branchKey?: string
  rank?: string
  createdAt?: string
  updatedAt?: string
}

export interface JourneyEventRevision {
  id: string
  journeyId: string
  eventId?: string
  journeyRevision: number
  operation: string
  patch: unknown
  inversePatch?: unknown
  actorId: string
  idempotencyKey?: string
  createdAt: string
}

export interface JourneyDocument {
  title: string
  description?: string
  status: JourneyStatus
  events: JourneyEvent[]
  links: JourneyEventLink[]
}

export interface DraftJourney extends JourneyDocument {
  id: string
}

export interface Journey extends JourneyDocument {
  id: string
  ownerId: string
  revision: number
  visibility: JourneyVisibility
  createdAt: string
  updatedAt: string
}

export interface JourneyInput extends JourneyDocument {
  id?: string
  ownerId?: string
}

export type CreateJourneyInput = JourneyInput
export type UpdateJourneyInput = JourneyInput
export type JourneyDto = Journey

type DistributiveOmit<T, TKey extends PropertyKey> = T extends unknown
  ? Omit<T, TKey>
  : never

export type JourneyEventCreateInput = DistributiveOmit<
  JourneyEvent,
  "id" | "journeyId" | "createdAt" | "updatedAt"
> & { id?: string }

export interface JourneyEventPatchInput {
  title?: string
  description?: string | null
  executionStatus?: JourneyEventExecutionStatus
  plannedStartAt?: string | null
  plannedEndAt?: string | null
  actualStartAt?: string | null
  actualEndAt?: string | null
  detail?: Record<string, unknown>
}

export type JourneyEventPosition =
  | { placement: "start"; parentEventId?: string }
  | { placement: "end"; parentEventId?: string }
  | { placement: "before"; eventId: string }
  | { placement: "after"; eventId: string }
