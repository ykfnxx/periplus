import { silkRoadJourney } from "@/lib/mock-journeys"
import type {
  TargetJourneyEvent,
  TargetJourneyEventLink,
  TargetJourneyGraphSnapshot,
  TargetTransitPlanningRun,
} from "@/modules/data-model/contracts"

export const silkRoadJourneyWithPlans = silkRoadJourney

const storyTimestamp = "2026-09-30T00:00:00.000Z"
const dunhuangSectionId = "section-dunhuang"

type TransitEvent = Extract<TargetJourneyEvent, { type: "TRANSIT" }>
type LocationEvent = Extract<
  TargetJourneyEvent,
  { type: "VISIT" | "STAY" | "MEAL" | "ACTIVITY" }
>
type TransitSegment =
  TargetTransitPlanningRun["plans"][number]["segments"][number]

function locationEvent(id: string) {
  const event = silkRoadJourney.events.find(
    (candidate): candidate is LocationEvent =>
      candidate.id === id &&
      (candidate.type === "VISIT" ||
        candidate.type === "STAY" ||
        candidate.type === "MEAL" ||
        candidate.type === "ACTIVITY")
  )
  if (!event) throw new Error(`Missing Storybook location event ${id}`)
  return event
}

function transitEvent({
  id,
  fromEventId,
  toEventId,
  plannedStartAt,
  plannedEndAt,
  durationMinutes,
  transportMode,
  routeState,
  activePlanningRunId,
  selectedPlanId,
}: {
  id: string
  fromEventId: string
  toEventId: string
  plannedStartAt?: string
  plannedEndAt?: string
  durationMinutes: number
  transportMode: TransitEvent["detail"]["transportMode"]
  routeState: TransitEvent["detail"]["routeState"]
  activePlanningRunId?: string
  selectedPlanId?: string
}): TransitEvent {
  return {
    id,
    journeyId: silkRoadJourney.id,
    parentSectionEventId: dunhuangSectionId,
    // This fixture represents an in-progress draft: it remains in the linked
    // CITY chain while its day is not yet known.
    placementStatus: "SCHEDULED",
    origin: "ORIGINAL",
    title: "交通",
    introducedRevision: 1,
    createdAt: storyTimestamp,
    updatedAt: storyTimestamp,
    type: "TRANSIT",
    executionStatus: "PLANNED",
    plannedStartAt,
    plannedEndAt,
    detail: {
      plannedFromEventId: fromEventId,
      plannedToEventId: toEventId,
      transportMode,
      requestMode:
        transportMode === "WALK"
          ? "WALK"
          : transportMode === "BUS" || transportMode === "SUBWAY"
            ? "TRANSIT"
            : "DRIVE",
      preference: "RECOMMENDED",
      plannedDurationMinutes: durationMinutes,
      routeState,
      activePlanningRunId,
      selectedPlanId,
    },
  }
}

function readyPlanningRun({
  eventId,
  runId,
  planId,
  label,
  segments,
}: {
  eventId: string
  runId: string
  planId: string
  label: string
  segments: TransitSegment[]
}): TargetTransitPlanningRun {
  const durationSeconds = segments.reduce(
    (total, segment) => total + (segment.durationSeconds ?? 0),
    0
  )
  const distanceMeters = segments.reduce(
    (total, segment) => total + (segment.distanceMeters ?? 0),
    0
  )
  return {
    id: runId,
    transitEventId: eventId,
    requestFingerprint: `${eventId}-storybook`,
    provider: "amap",
    status: "READY",
    calculatedAt: storyTimestamp,
    plans: [
      {
        id: planId,
        planningRunId: runId,
        transitEventId: eventId,
        provider: "amap",
        rank: 0,
        label,
        strategy: "RECOMMENDED",
        distanceMeters,
        durationSeconds,
        trafficBasis: "PREDICTED",
        calculatedAt: storyTimestamp,
        segments,
      },
    ],
  }
}

function segment(
  id: string,
  order: number,
  mode: TransitSegment["mode"],
  positions: TransitSegment["positions"],
  distanceMeters: number,
  durationSeconds: number
): TransitSegment {
  return {
    id,
    order,
    mode,
    distanceMeters,
    durationSeconds,
    coordinateSystem: "GCJ02",
    geometryKind: mode === "BUS" ? "TRANSIT_LINE" : "ROAD_NETWORK",
    positions,
  }
}

const normalTransit = transitEvent({
  id: "transit-dunhuang-normal",
  fromEventId: "visit-dunhuang-mogao",
  toEventId: "meal-dunhuang-noodles",
  plannedStartAt: "2026-10-06T09:00:00.000Z",
  plannedEndAt: "2026-10-06T09:32:00.000Z",
  durationMinutes: 32,
  transportMode: "TAXI",
  routeState: "READY",
  activePlanningRunId: "run-dunhuang-normal",
  selectedPlanId: "plan-dunhuang-normal",
})

const multiSegmentTransit = transitEvent({
  id: "transit-dunhuang-multi",
  fromEventId: "visit-dunhuang-mingsha",
  toEventId: "activity-dunhuang-sunset",
  plannedStartAt: "2026-10-07T04:00:00.000Z",
  plannedEndAt: "2026-10-07T04:36:00.000Z",
  durationMinutes: 36,
  transportMode: "BUS",
  routeState: "READY",
  activePlanningRunId: "run-dunhuang-multi",
  selectedPlanId: "plan-dunhuang-multi",
})

const fallbackTransit = transitEvent({
  id: "transit-dunhuang-fallback",
  fromEventId: "stay-dunhuang-2",
  toEventId: "visit-dunhuang-unscheduled",
  durationMinutes: 18,
  transportMode: "WALK",
  routeState: "EMPTY",
})

const unscheduledLocation: LocationEvent = {
  ...locationEvent("visit-dunhuang-mogao"),
  id: "visit-dunhuang-unscheduled",
  placementStatus: "SCHEDULED",
  title: "待定补充景点",
  description: "尚未确定到访日，保留在原事件链尾部",
  plannedStartAt: undefined,
  plannedEndAt: undefined,
  detail: {
    ...locationEvent("visit-dunhuang-mogao").detail,
    plannedLat: 40.128,
    plannedLng: 94.646,
    plannedDurationMinutes: 90,
  },
}

const normalRun = readyPlanningRun({
  eventId: normalTransit.id,
  runId: "run-dunhuang-normal",
  planId: "plan-dunhuang-normal",
  label: "出租车直达",
  segments: [
    segment(
      "segment-dunhuang-normal-1",
      0,
      "TAXI",
      [
        [94.8091, 40.0373],
        [94.775, 40.061],
        [94.724, 40.093],
        [94.661, 40.142],
      ],
      18_400,
      1_920
    ),
  ],
})

const multiSegmentRun = readyPlanningRun({
  eventId: multiSegmentTransit.id,
  runId: "run-dunhuang-multi",
  planId: "plan-dunhuang-multi",
  label: "步行 + 公交 + 步行",
  segments: [
    segment(
      "segment-dunhuang-multi-1",
      0,
      "WALK",
      [
        [94.6818, 40.0875],
        [94.6842, 40.0865],
      ],
      360,
      360
    ),
    segment(
      "segment-dunhuang-multi-2",
      1,
      "BUS",
      [
        [94.6842, 40.0865],
        [94.6876, 40.0847],
        [94.6902, 40.0828],
      ],
      1_120,
      1_260
    ),
    segment(
      "segment-dunhuang-multi-3",
      2,
      "WALK",
      [
        [94.6902, 40.0828],
        [94.692, 40.081],
      ],
      260,
      300
    ),
  ],
})

const dunhuangChain: TargetJourneyEvent[] = [
  locationEvent("visit-dunhuang-mogao"),
  normalTransit,
  locationEvent("meal-dunhuang-noodles"),
  locationEvent("stay-dunhuang-1"),
  locationEvent("visit-dunhuang-mingsha"),
  multiSegmentTransit,
  locationEvent("activity-dunhuang-sunset"),
  locationEvent("stay-dunhuang-2"),
  fallbackTransit,
  unscheduledLocation,
]

const dunhuangLinks: TargetJourneyEventLink[] = dunhuangChain
  .slice(0, -1)
  .map((event, index) => ({
    id: `link-dunhuang-story-${index + 1}`,
    journeyId: silkRoadJourney.id,
    fromEventId: event.id,
    toEventId: dunhuangChain[index + 1]!.id,
    kind: "MAIN",
    rank: (index + 1) * 1024,
    introducedRevision: 1,
  }))

export const dunhuangRouteStoryJourney: TargetJourneyGraphSnapshot = {
  ...silkRoadJourney,
  events: [
    ...silkRoadJourney.events.filter(
      (event) => event.parentSectionEventId !== dunhuangSectionId
    ),
    ...dunhuangChain,
  ],
  links: [
    ...silkRoadJourney.links.filter(
      (link) => !link.id.startsWith("link-dunhuang-")
    ),
    ...dunhuangLinks,
  ],
  transitPlanningRuns: [normalRun, multiSegmentRun],
}

export const selectedDayTwoMarker = locationEvent("activity-dunhuang-sunset")

export const selectedUnscheduledMarker = unscheduledLocation

export const dunhuangRouteStoryEventIds = {
  normal: normalTransit.id,
  multiSegment: multiSegmentTransit.id,
  fallback: fallbackTransit.id,
} as const
