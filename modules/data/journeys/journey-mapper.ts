import type { Prisma } from "@prisma/client"
import type {
  TargetActorReference,
  TargetJourneyEvent,
  TargetJourneyGraphSnapshot,
  TargetTransitPlanningRun,
} from "@/modules/data-model/contracts"
import { validateJourneyGraph } from "./journey-graph-validator"

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
          planningRuns: {
            include: {
              plans: {
                include: {
                  segments: { orderBy: [{ order: "asc" }, { id: "asc" }] },
                },
                orderBy: [{ rank: "asc" }, { id: "asc" }],
              },
            },
            orderBy: [{ calculatedAt: "asc" }, { id: "asc" }],
          },
        },
      },
      observations: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
  links: {
    orderBy: [{ introducedRevision: "asc" }, { rank: "asc" }, { id: "asc" }],
  },
  replacements: { orderBy: [{ revision: "asc" }, { id: "asc" }] },
  branchSelections: {
    orderBy: [{ journeyRevision: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  },
  assetLinks: {
    orderBy: [{ introducedRevision: "asc" }, { rank: "asc" }, { id: "asc" }],
  },
  sourceLinks: {
    orderBy: [{ introducedRevision: "asc" }, { rank: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.JourneyInclude

export type JourneyRecord = Prisma.JourneyGetPayload<{
  include: typeof journeyInclude
}>

function iso(value: Date | null | undefined) {
  return value?.toISOString()
}

function parseJson<T>(value: string | null, label: string): T {
  if (value === null) {
    throw new Error(`${label} is missing persisted JSON`)
  }
  try {
    return JSON.parse(value) as T
  } catch {
    throw new Error(`${label} contains invalid persisted JSON`)
  }
}

function actor(
  kind: "USER" | "AGENT" | "SYSTEM",
  userId: string | null,
  agentRunId: string | null,
  label: string
): TargetActorReference {
  if (kind === "USER" && userId && !agentRunId) {
    return { kind, userId }
  }
  if (kind === "AGENT" && agentRunId && !userId) {
    return { kind, agentRunId }
  }
  if (kind === "SYSTEM" && !userId && !agentRunId) return { kind }
  throw new Error(`${label} has an invalid actor reference`)
}

function eventBase(event: JourneyRecord["events"][number]) {
  return {
    id: event.id,
    journeyId: event.journeyId,
    parentSectionEventId: event.parentSectionEventId,
    placementStatus: event.placementStatus,
    origin: event.origin,
    title: event.title,
    description: event.description ?? undefined,
    introducedRevision: event.introducedRevision,
    retiredRevision: event.retiredRevision ?? undefined,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
  }
}

function executableEventBase(event: JourneyRecord["events"][number]) {
  if (!event.executionStatus) {
    throw new Error(`executable Journey Event ${event.id} has no status`)
  }
  return {
    ...eventBase(event),
    executionStatus: event.executionStatus,
    plannedStartAt: iso(event.plannedStartAt),
    plannedEndAt: iso(event.plannedEndAt),
    actualStartAt: iso(event.actualStartAt),
    actualEndAt: iso(event.actualEndAt),
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
    coordinateSystem: detail.coordinateSystem,
    coordinateProvider: detail.coordinateProvider ?? undefined,
    providerPlaceId: detail.providerPlaceId ?? undefined,
    plannedDurationMinutes: detail.plannedDurationMinutes ?? undefined,
    actualDurationMinutes: detail.actualDurationMinutes ?? undefined,
  }
}

function mapTransitRun(
  run: NonNullable<
    JourneyRecord["events"][number]["transitDetail"]
  >["planningRuns"][number]
): TargetTransitPlanningRun {
  return {
    id: run.id,
    transitEventId: run.transitEventId,
    requestFingerprint: run.requestFingerprint,
    provider: run.provider,
    status: run.status,
    errorCode: run.errorCode ?? undefined,
    errorMessage: run.errorMessage ?? undefined,
    warning: run.warning ?? undefined,
    calculatedAt: run.calculatedAt.toISOString(),
    validUntil: iso(run.validUntil),
    plans: run.plans.map((plan) => ({
      id: plan.id,
      planningRunId: plan.planningRunId,
      transitEventId: plan.transitEventId,
      provider: plan.provider,
      rank: plan.rank,
      label: plan.label,
      strategy: plan.strategy,
      distanceMeters: plan.distanceMeters,
      durationSeconds: plan.durationSeconds,
      fareAmount: plan.fareAmount ?? undefined,
      trafficBasis: plan.trafficBasis,
      calculatedAt: plan.calculatedAt.toISOString(),
      validUntil: iso(plan.validUntil),
      segments: plan.segments.map((segment) => ({
        id: segment.id,
        order: segment.order,
        mode: segment.mode,
        fromName: segment.fromName ?? undefined,
        toName: segment.toName ?? undefined,
        lineName: segment.lineName ?? undefined,
        distanceMeters: segment.distanceMeters ?? undefined,
        durationSeconds: segment.durationSeconds ?? undefined,
        fareAmount: segment.fareAmount ?? undefined,
        departAt: iso(segment.departAt),
        arriveAt: iso(segment.arriveAt),
        coordinateSystem: segment.coordinateSystem,
        geometryKind: segment.geometryKind,
        positions: parseJson<[number, number][]>(
          segment.positionsJson,
          `TransitSegment ${segment.id} positions`
        ),
        trafficSections: segment.trafficSectionsJson
          ? parseJson(
              segment.trafficSectionsJson,
              `TransitSegment ${segment.id} traffic sections`
            )
          : undefined,
      })),
    })),
  }
}

function mapEvent(event: JourneyRecord["events"][number]): TargetJourneyEvent {
  if (event.type === "SECTION" && event.sectionDetail) {
    const detail = event.sectionDetail
    if (detail.kind === "DAY" && detail.localDate && detail.timezone) {
      return {
        ...eventBase(event),
        type: "SECTION",
        detail: {
          kind: "DAY",
          localDate: detail.localDate,
          timezone: detail.timezone,
        },
      }
    }
    if (detail.kind === "CITY" && detail.timezone) {
      return {
        ...eventBase(event),
        type: "SECTION",
        detail: {
          kind: "CITY",
          timeZone: detail.timezone,
          placeId: detail.placeId ?? undefined,
          lat: detail.lat ?? undefined,
          lng: detail.lng ?? undefined,
          coordinateSystem: detail.coordinateSystem ?? undefined,
        },
      }
    }
    if (detail.kind === "THEME") {
      return {
        ...eventBase(event),
        type: "SECTION",
        detail: {
          kind: "THEME",
          sourcePackId: detail.sourcePackId ?? undefined,
        },
      }
    }
  }
  if (event.type === "VISIT" && event.visitDetail) {
    return {
      ...executableEventBase(event),
      type: "VISIT",
      detail: {
        ...locationDetail(event.visitDetail),
        providerCoverImage: event.visitDetail.providerCoverImageJson
          ? parseJson(
              event.visitDetail.providerCoverImageJson,
              `VisitEventDetail ${event.id} provider cover image`
            )
          : undefined,
      },
    }
  }
  if (event.type === "STAY" && event.stayDetail) {
    return {
      ...executableEventBase(event),
      type: "STAY",
      detail: {
        ...locationDetail(event.stayDetail),
        checkInNote: event.stayDetail.checkInNote ?? undefined,
        hotelOffer: event.stayDetail.hotelOfferSnapshotJson
          ? parseJson(
              event.stayDetail.hotelOfferSnapshotJson,
              `StayEventDetail ${event.id} hotel offer`
            )
          : undefined,
      },
    }
  }
  if (event.type === "MEAL" && event.mealDetail) {
    return {
      ...executableEventBase(event),
      type: "MEAL",
      detail: {
        ...locationDetail(event.mealDetail),
        cuisine: event.mealDetail.cuisine ?? undefined,
      },
    }
  }
  if (event.type === "ACTIVITY" && event.activityDetail) {
    return {
      ...executableEventBase(event),
      type: "ACTIVITY",
      detail: {
        ...locationDetail(event.activityDetail),
        bookingReference: event.activityDetail.bookingReference ?? undefined,
      },
    }
  }
  if (event.type === "TRANSIT" && event.transitDetail) {
    return {
      ...executableEventBase(event),
      type: "TRANSIT",
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
        activePlanningRunId:
          event.transitDetail.activePlanningRunId ?? undefined,
        selectedPlanId: event.transitDetail.selectedPlanId ?? undefined,
        routeState: event.transitDetail.routeState,
        notes: event.transitDetail.notes ?? undefined,
      },
    }
  }
  if (event.type === "NOTE" && event.noteDetail) {
    return {
      ...eventBase(event),
      type: "NOTE",
      detail: { body: event.noteDetail.body },
    }
  }
  throw new Error(`Journey Event ${event.id} has no matching typed detail`)
}

function mapObservation(
  observation: JourneyRecord["events"][number]["observations"][number]
) {
  const identity = {
    id: observation.id,
    eventId: observation.eventId,
    phase: observation.phase,
    observedAt: observation.observedAt.toISOString(),
    actor: actor(
      observation.actorKind,
      observation.actorUserId,
      observation.actorAgentRunId,
      `EventObservation ${observation.id}`
    ),
    supersedesId: observation.supersedesId ?? undefined,
    visibility: observation.visibility,
    createdAt: observation.createdAt.toISOString(),
  }
  const value = observation.valueJson
    ? parseJson<unknown>(
        observation.valueJson,
        `EventObservation ${observation.id} value`
      )
    : undefined
  if (observation.kind === "NOTE" || observation.kind === "FACT") {
    if (!observation.body) {
      throw new Error(`EventObservation ${observation.id} requires body`)
    }
    return { ...identity, kind: observation.kind, body: observation.body }
  }
  return {
    ...identity,
    kind: observation.kind,
    value,
    body: observation.body ?? undefined,
  }
}

export function mapJourneyToGraph(
  journey: JourneyRecord
): TargetJourneyGraphSnapshot {
  const graph = {
    id: journey.id,
    ownerId: journey.ownerId,
    revision: journey.revision,
    status: journey.status,
    visibility: journey.visibility,
    title: journey.title,
    description: journey.description ?? undefined,
    deletedAt: iso(journey.deletedAt),
    events: journey.events.map(mapEvent),
    links: journey.links.map((link) => ({
      id: link.id,
      journeyId: link.journeyId,
      fromEventId: link.fromEventId,
      toEventId: link.toEventId,
      kind: link.kind,
      branchKey: link.branchKey ?? undefined,
      rank: link.rank,
      introducedRevision: link.introducedRevision,
      retiredRevision: link.retiredRevision ?? undefined,
    })),
    replacements: journey.replacements.map((replacement) => ({
      id: replacement.id,
      journeyId: replacement.journeyId,
      predecessorEventId: replacement.predecessorEventId,
      successorEventId: replacement.successorEventId,
      revision: replacement.revision,
      reason: replacement.reason,
    })),
    branchSelections: journey.branchSelections.map((selection) => ({
      id: selection.id,
      journeyId: selection.journeyId,
      forkEventId: selection.forkEventId,
      selectedLinkId: selection.selectedLinkId,
      journeyRevision: selection.journeyRevision,
      supersedesId: selection.supersedesId ?? undefined,
      actor: actor(
        selection.actorKind,
        selection.actorUserId,
        selection.actorAgentRunId,
        `JourneyBranchSelection ${selection.id}`
      ),
      reason: selection.reason ?? undefined,
      createdAt: selection.createdAt.toISOString(),
    })),
    transitPlanningRuns: journey.events.flatMap(
      (event) => event.transitDetail?.planningRuns.map(mapTransitRun) ?? []
    ),
    eventAssetLinks: journey.assetLinks.map((link) => ({
      id: link.id,
      journeyId: link.journeyId,
      eventId: link.eventId,
      assetId: link.assetId,
      assetChecksum: link.assetChecksum,
      role: link.role,
      rank: link.rank,
      caption: link.caption ?? undefined,
      visibility: link.visibility,
      introducedRevision: link.introducedRevision,
      createdAt: link.createdAt.toISOString(),
      retiredRevision: link.retiredRevision ?? undefined,
    })),
    observations: journey.events.flatMap((event) =>
      event.observations.map(mapObservation)
    ),
    eventSourceLinks: journey.sourceLinks.map((link) => ({
      id: link.id,
      journeyId: link.journeyId,
      eventId: link.eventId,
      sourceItemId: link.sourceItemId,
      sourceDocumentId: link.sourceDocumentId,
      sourceDocumentChecksum: link.sourceDocumentChecksum,
      role: link.role,
      excerpt: link.excerpt ?? undefined,
      page: link.page ?? undefined,
      confidence: link.confidence,
      rank: link.rank,
      approvedForJourneySharing: link.approvedForJourneySharing,
      introducedRevision: link.introducedRevision,
      createdAt: link.createdAt.toISOString(),
      retiredRevision: link.retiredRevision ?? undefined,
    })),
  }
  return validateJourneyGraph(graph)
}
