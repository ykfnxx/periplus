import type { Prisma } from "@prisma/client"
import type {
  ActivityEvent,
  JourneyDto,
  JourneyEvent,
  JourneyEventLink,
  MealEvent,
  NoteEvent,
  SectionEvent,
  StayEvent,
  TransitEvent,
  TransitGeometryKind,
  TransitPlan,
  TransitSegmentMode,
  TransitTrafficBasis,
  VisitEvent,
} from "@/types/journey"

export const journeyInclude = {
  events: {
    include: {
      sectionDetail: true,
      visitDetail: true,
      stayDetail: true,
      mealDetail: true,
      activityDetail: true,
      noteDetail: true,
      transitDetail: {
        include: {
          plans: {
            include: { segments: { orderBy: { order: "asc" as const } } },
            orderBy: { rank: "asc" as const },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" as const },
  },
  links: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.JourneyInclude

export type JourneyRecord = Prisma.JourneyGetPayload<{
  include: typeof journeyInclude
}>

function iso(date: Date | null | undefined) {
  return date?.toISOString()
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function eventBase(event: JourneyRecord["events"][number]) {
  return {
    id: event.id,
    journeyId: event.journeyId,
    parentEventId: event.parentEventId ?? undefined,
    replacedByEventId: event.replacedByEventId ?? undefined,
    origin: event.origin,
    title: event.title,
    description: event.description ?? undefined,
    plannedStartAt: iso(event.plannedStartAt),
    plannedEndAt: iso(event.plannedEndAt),
    actualStartAt: iso(event.actualStartAt),
    actualEndAt: iso(event.actualEndAt),
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  }
}

function locationDetail(
  detail:
    | NonNullable<JourneyRecord["events"][number]["visitDetail"]>
    | NonNullable<JourneyRecord["events"][number]["stayDetail"]>
    | NonNullable<JourneyRecord["events"][number]["mealDetail"]>
    | NonNullable<JourneyRecord["events"][number]["activityDetail"]>
) {
  return {
    plannedPlaceId: detail.plannedPlaceId ?? undefined,
    actualPlaceId: detail.actualPlaceId ?? undefined,
    plannedLat: detail.plannedLat,
    plannedLng: detail.plannedLng,
    actualLat: detail.actualLat ?? undefined,
    actualLng: detail.actualLng ?? undefined,
    coordinateSystem: detail.coordinateSystem ?? undefined,
    coordinateProvider: detail.coordinateProvider ?? undefined,
    providerPlaceId: detail.providerPlaceId ?? undefined,
    plannedDurationMinutes: detail.plannedDurationMinutes ?? undefined,
    actualDurationMinutes: detail.actualDurationMinutes ?? undefined,
  }
}

function mapTransitPlan(
  plan: NonNullable<
    JourneyRecord["events"][number]["transitDetail"]
  >["plans"][number]
): TransitPlan {
  return {
    id: plan.id,
    provider: plan.provider as TransitPlan["provider"],
    rank: plan.rank,
    label: plan.label,
    strategy: plan.strategy,
    distanceMeters: plan.distanceMeters,
    durationSeconds: plan.durationSeconds,
    fareAmount: plan.fareAmount ?? undefined,
    trafficBasis: plan.trafficBasis as TransitTrafficBasis,
    calculatedAt: plan.calculatedAt.toISOString(),
    validUntil: iso(plan.validUntil),
    requestFingerprint: plan.requestFingerprint,
    segments: plan.segments.map((segment) => ({
      id: segment.id,
      order: segment.order,
      mode: segment.mode as TransitSegmentMode,
      fromName: segment.fromName ?? undefined,
      toName: segment.toName ?? undefined,
      lineName: segment.lineName ?? undefined,
      distanceMeters: segment.distanceMeters ?? undefined,
      durationSeconds: segment.durationSeconds ?? undefined,
      fareAmount: segment.fareAmount ?? undefined,
      departAt: iso(segment.departAt),
      arriveAt: iso(segment.arriveAt),
      coordinateSystem: "GCJ02",
      geometryKind: segment.geometryKind as TransitGeometryKind,
      positions: parseJson(segment.positionsJson, []),
      trafficSections: parseJson(segment.trafficSectionsJson, undefined),
    })),
  }
}

function mapEvent(event: JourneyRecord["events"][number]): JourneyEvent {
  const base = eventBase(event)

  if (event.type === "SECTION" && event.sectionDetail) {
    return {
      ...base,
      type: "SECTION",
      detail: {
        kind: event.sectionDetail.kind,
        placeId: event.sectionDetail.placeId ?? undefined,
        lat: event.sectionDetail.lat ?? undefined,
        lng: event.sectionDetail.lng ?? undefined,
        coordinateSystem: event.sectionDetail.coordinateSystem ?? undefined,
        coordinateProvider: event.sectionDetail.coordinateProvider ?? undefined,
        providerPlaceId: event.sectionDetail.providerPlaceId ?? undefined,
      },
    } satisfies SectionEvent
  }

  const executionStatus = event.executionStatus ?? "PLANNED"
  if (event.type === "VISIT" && event.visitDetail) {
    return {
      ...base,
      type: "VISIT",
      executionStatus,
      detail: locationDetail(event.visitDetail),
    } satisfies VisitEvent
  }
  if (event.type === "STAY" && event.stayDetail) {
    return {
      ...base,
      type: "STAY",
      executionStatus,
      detail: {
        ...locationDetail(event.stayDetail),
        checkInNote: event.stayDetail.checkInNote ?? undefined,
      },
    } satisfies StayEvent
  }
  if (event.type === "MEAL" && event.mealDetail) {
    return {
      ...base,
      type: "MEAL",
      executionStatus,
      detail: {
        ...locationDetail(event.mealDetail),
        cuisine: event.mealDetail.cuisine ?? undefined,
      },
    } satisfies MealEvent
  }
  if (event.type === "ACTIVITY" && event.activityDetail) {
    return {
      ...base,
      type: "ACTIVITY",
      executionStatus,
      detail: {
        ...locationDetail(event.activityDetail),
        bookingReference: event.activityDetail.bookingReference ?? undefined,
      },
    } satisfies ActivityEvent
  }
  if (event.type === "TRANSIT" && event.transitDetail) {
    return {
      ...base,
      type: "TRANSIT",
      executionStatus,
      detail: {
        plannedFromEventId: event.transitDetail.plannedFromEventId ?? undefined,
        plannedToEventId: event.transitDetail.plannedToEventId ?? undefined,
        actualFromEventId: event.transitDetail.actualFromEventId ?? undefined,
        actualToEventId: event.transitDetail.actualToEventId ?? undefined,
        transportMode: event.transitDetail.transportMode,
        requestMode: event.transitDetail.requestMode ?? undefined,
        preference: event.transitDetail.preference ?? undefined,
        plannedDepartAt: iso(event.transitDetail.plannedDepartAt),
        actualDepartAt: iso(event.transitDetail.actualDepartAt),
        plannedDurationMinutes:
          event.transitDetail.plannedDurationMinutes ?? undefined,
        actualDurationMinutes:
          event.transitDetail.actualDurationMinutes ?? undefined,
        plannedDistanceKm: event.transitDetail.plannedDistanceKm ?? undefined,
        actualDistanceKm: event.transitDetail.actualDistanceKm ?? undefined,
        plannedCostEstimate:
          event.transitDetail.plannedCostEstimate ?? undefined,
        actualCost: event.transitDetail.actualCost ?? undefined,
        selectedPlanId: event.transitDetail.selectedPlanId ?? undefined,
        planningStatus: (event.transitDetail.planningStatus ??
          "EMPTY") as TransitEvent["detail"]["planningStatus"],
        planningFingerprint: event.transitDetail.plans[0]?.requestFingerprint,
        planningWarning: event.transitDetail.planningWarning ?? undefined,
        notes: event.transitDetail.notes ?? undefined,
        plans: event.transitDetail.plans.map(mapTransitPlan),
      },
    } satisfies TransitEvent
  }
  if (event.type === "NOTE" && event.noteDetail) {
    return {
      ...base,
      type: "NOTE",
      detail: { body: event.noteDetail.body },
    } satisfies NoteEvent
  }

  throw new Error(`Journey event ${event.id} has no matching detail`)
}

function mapLink(link: JourneyRecord["links"][number]): JourneyEventLink {
  return {
    id: link.id,
    journeyId: link.journeyId,
    fromEventId: link.fromEventId,
    toEventId: link.toEventId,
    kind: link.kind,
    branchKey: link.branchKey ?? undefined,
    rank: link.rank ?? undefined,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString(),
  }
}

export function mapJourneyToDto(journey: JourneyRecord): JourneyDto {
  return {
    id: journey.id,
    ownerId: journey.ownerId,
    revision: journey.revision,
    status: journey.status,
    visibility:
      journey.visibility === "unlisted" || journey.visibility === "public"
        ? journey.visibility
        : "private",
    title: journey.title,
    description: journey.description ?? undefined,
    createdAt: journey.createdAt.toISOString(),
    updatedAt: journey.updatedAt.toISOString(),
    events: journey.events.map(mapEvent),
    links: journey.links.map(mapLink),
  }
}
