import type {
  TargetFlatJourneyCity,
  TargetFlatJourneyEvent,
  TargetFlatJourneySnapshot,
  TargetJourneyEvent,
  TargetJourneyEventLink,
  TargetJourneyGraphSnapshot,
  TargetTransitPlanningRun,
} from "@/modules/data-model/contracts"

export type FlatLocationEvent = Exclude<
  TargetFlatJourneyEvent,
  { kind: "TRANSIT" }
>
export type FlatTransitEvent = Extract<
  TargetFlatJourneyEvent,
  { kind: "TRANSIT" }
>

export interface FlatJourneyCitySegment {
  id: string
  city: TargetFlatJourneyCity
  events: TargetFlatJourneyEvent[]
  locationEvents: FlatLocationEvent[]
}

interface FlatJourneyLayout {
  segments: FlatJourneyCitySegment[]
  segmentByEventId: Map<string, FlatJourneyCitySegment>
  rootEvents: Array<FlatJourneyCitySegment | FlatTransitEvent>
}

const layoutCache = new WeakMap<TargetFlatJourneySnapshot, FlatJourneyLayout>()
const graphCache = new WeakMap<
  TargetFlatJourneySnapshot,
  Map<string, TargetJourneyGraphSnapshot>
>()

function isLocationEvent(
  event: TargetFlatJourneyEvent
): event is FlatLocationEvent {
  return event.kind !== "TRANSIT"
}

function segmentId(city: TargetFlatJourneyCity, firstEventId: string) {
  return `city-segment:${city.key}:${firstEventId}`
}

export function deriveFlatJourneyLayout(
  snapshot: TargetFlatJourneySnapshot
): FlatJourneyLayout {
  const cached = layoutCache.get(snapshot)
  if (cached) return cached

  const locationEvents = snapshot.events.filter(isLocationEvent)
  const locationById = new Map(
    locationEvents.map((event) => [event.eventId, event])
  )
  const segments: FlatJourneyCitySegment[] = []
  const segmentByLocationId = new Map<string, FlatJourneyCitySegment>()

  for (const event of locationEvents) {
    const previous = segments.at(-1)
    const segment =
      previous?.city.key === event.city.key
        ? previous
        : {
            id: segmentId(event.city, event.eventId),
            city: event.city,
            events: [],
            locationEvents: [],
          }
    if (segment !== previous) segments.push(segment)
    segment.locationEvents.push(event)
    segmentByLocationId.set(event.eventId, segment)
  }

  const rootEvents: Array<FlatJourneyCitySegment | FlatTransitEvent> = []
  const addedSegments = new Set<string>()
  const segmentByEventId = new Map<string, FlatJourneyCitySegment>()

  for (const event of snapshot.events) {
    if (isLocationEvent(event)) {
      const segment = segmentByLocationId.get(event.eventId)
      if (!segment) continue
      segment.events.push(event)
      segmentByEventId.set(event.eventId, segment)
      if (!addedSegments.has(segment.id)) {
        rootEvents.push(segment)
        addedSegments.add(segment.id)
      }
      continue
    }

    const fromSegment = segmentByLocationId.get(event.detail.fromEventKey)
    const toSegment = segmentByLocationId.get(event.detail.toEventKey)
    if (fromSegment && fromSegment === toSegment) {
      fromSegment.events.push(event)
      segmentByEventId.set(event.eventId, fromSegment)
    } else {
      rootEvents.push(event)
    }
  }

  const layout = { segments, segmentByEventId, rootEvents }
  layoutCache.set(snapshot, layout)
  return layout
}

export function projectFlatJourneyForWorkspace(
  snapshot: TargetFlatJourneySnapshot,
  ownerId: string
): TargetJourneyGraphSnapshot {
  const ownerCache = graphCache.get(snapshot) ?? new Map()
  const cached = ownerCache.get(ownerId)
  if (cached) return cached

  const layout = deriveFlatJourneyLayout(snapshot)
  const revision = Math.max(1, snapshot.revision)
  const createdAt =
    snapshot.events.find((event) => event.plannedStartAt)?.plannedStartAt ??
    "1970-01-01T00:00:00.000Z"
  const sectionById = new Map(
    layout.segments.map((segment) => [
      segment.id,
      sectionEvent(snapshot, segment, revision, createdAt),
    ])
  )
  const eventById = new Map(
    snapshot.events.map((event) => [event.eventId, event])
  )
  const transitPlanningRuns: TargetTransitPlanningRun[] = []
  const projectedEvents: TargetJourneyEvent[] = [
    ...sectionById.values(),
    ...snapshot.events.map((event) => {
      const segment = layout.segmentByEventId.get(event.eventId)
      if (event.kind !== "TRANSIT") {
        return locationEvent(
          snapshot,
          event,
          segment?.id ?? null,
          revision,
          createdAt
        )
      }
      const fromSegment = layout.segmentByEventId.get(event.detail.fromEventKey)
      const toSegment = layout.segmentByEventId.get(event.detail.toEventKey)
      const localSegment =
        fromSegment && fromSegment === toSegment ? fromSegment : null
      const fromId = localSegment
        ? event.detail.fromEventKey
        : (fromSegment?.id ?? event.detail.fromEventKey)
      const toId = localSegment
        ? event.detail.toEventKey
        : (toSegment?.id ?? event.detail.toEventKey)
      const run = routeProjection(
        event,
        eventById.get(event.detail.fromEventKey),
        eventById.get(event.detail.toEventKey)
      )
      if (run) transitPlanningRuns.push(run)
      return transitEvent(
        snapshot,
        event,
        localSegment?.id ?? null,
        fromId,
        toId,
        run,
        revision,
        createdAt
      )
    }),
  ]
  const links: TargetJourneyEventLink[] = []
  for (const segment of layout.segments) {
    links.push(...sequenceLinks(snapshot.journeyId, segment.events, revision))
  }
  links.push(
    ...sequenceLinks(
      snapshot.journeyId,
      layout.rootEvents.map((entry) =>
        "eventId" in entry ? entry : { eventId: entry.id }
      ),
      revision,
      "root"
    )
  )

  const graph: TargetJourneyGraphSnapshot = {
    id: snapshot.journeyId,
    ownerId,
    revision,
    status: "ACTIVE",
    visibility: "PRIVATE",
    title: snapshot.title,
    ...(snapshot.description ? { description: snapshot.description } : {}),
    events: projectedEvents,
    links,
    replacements: [],
    branchSelections: [],
    transitPlanningRuns,
    eventAssetLinks: [],
    observations: [],
    eventSourceLinks: [],
  }
  ownerCache.set(ownerId, graph)
  graphCache.set(snapshot, ownerCache)
  return graph
}

export function replacementSegmentId(
  previous: TargetFlatJourneySnapshot,
  next: TargetFlatJourneySnapshot,
  previousSegmentId: string | null
) {
  if (!previousSegmentId) return null
  const previousLayout = deriveFlatJourneyLayout(previous)
  const nextLayout = deriveFlatJourneyLayout(next)
  if (nextLayout.segments.some((segment) => segment.id === previousSegmentId)) {
    return previousSegmentId
  }
  const previousSegment = previousLayout.segments.find(
    (segment) => segment.id === previousSegmentId
  )
  if (!previousSegment) return null
  const previousIds = new Set(
    previousSegment.locationEvents.map((event) => event.eventId)
  )
  const candidates = nextLayout.segments
    .map((segment) => ({
      segment,
      overlap: segment.locationEvents.filter((event) =>
        previousIds.has(event.eventId)
      ).length,
    }))
    .filter(({ overlap }) => overlap > 0)
    .sort((left, right) => right.overlap - left.overlap)
  return candidates[0]?.segment.id ?? null
}

export function nearestEventInReplacementSegment(
  previous: TargetFlatJourneySnapshot,
  next: TargetFlatJourneySnapshot,
  previousEventId: string,
  nextSegmentId: string
) {
  const previousLayout = deriveFlatJourneyLayout(previous)
  const nextLayout = deriveFlatJourneyLayout(next)
  const previousSegment = previousLayout.segmentByEventId.get(previousEventId)
  const nextSegment = nextLayout.segments.find(
    (segment) => segment.id === nextSegmentId
  )
  if (!previousSegment || !nextSegment) return null
  const previousIndex = previousSegment.events.findIndex(
    (event) => event.eventId === previousEventId
  )
  const nextIndex = Math.min(
    Math.max(previousIndex, 0),
    Math.max(nextSegment.events.length - 1, 0)
  )
  return nextSegment.events[nextIndex] ?? null
}

function eventIdentity(
  snapshot: TargetFlatJourneySnapshot,
  eventId: string,
  parentSectionEventId: string | null,
  revision: number,
  createdAt: string
) {
  return {
    id: eventId,
    journeyId: snapshot.journeyId,
    parentSectionEventId,
    placementStatus: "SCHEDULED" as const,
    origin: "AGENT_INSERTED" as const,
    introducedRevision: revision,
    createdAt,
    updatedAt: createdAt,
  }
}

function sectionEvent(
  snapshot: TargetFlatJourneySnapshot,
  segment: FlatJourneyCitySegment,
  revision: number,
  createdAt: string
): TargetJourneyEvent {
  const firstPlace = segment.locationEvents[0]?.detail.place
  return {
    ...eventIdentity(snapshot, segment.id, null, revision, createdAt),
    type: "SECTION",
    title: segment.city.name,
    detail: {
      kind: "CITY",
      timeZone: segment.city.timeZone,
      ...(firstPlace
        ? {
            lat: firstPlace.lat,
            lng: firstPlace.lng,
            coordinateSystem: firstPlace.coordinateSystem,
          }
        : {}),
    },
  }
}

function locationEvent(
  snapshot: TargetFlatJourneySnapshot,
  event: FlatLocationEvent,
  parentSectionEventId: string | null,
  revision: number,
  createdAt: string
): TargetJourneyEvent {
  const base = {
    ...eventIdentity(
      snapshot,
      event.eventId,
      parentSectionEventId,
      revision,
      createdAt
    ),
    executionStatus: "PLANNED" as const,
    title: event.title,
    ...(event.description ? { description: event.description } : {}),
    ...(event.plannedStartAt ? { plannedStartAt: event.plannedStartAt } : {}),
    ...(event.plannedEndAt ? { plannedEndAt: event.plannedEndAt } : {}),
  }
  const detail = {
    plannedLat: event.detail.place.lat,
    plannedLng: event.detail.place.lng,
    coordinateSystem: event.detail.place.coordinateSystem,
    coordinateProvider: event.detail.place.provider,
    ...(event.detail.place.providerPlaceId
      ? { providerPlaceId: event.detail.place.providerPlaceId }
      : {}),
    ...(event.detail.plannedDurationMinutes === undefined
      ? {}
      : { plannedDurationMinutes: event.detail.plannedDurationMinutes }),
  }
  if (event.kind === "VISIT") {
    return {
      ...base,
      type: "VISIT",
      detail: {
        ...detail,
        ...(event.detail.coverImageUrl
          ? {
              providerCoverImage: {
                provider: "amap" as const,
                url: event.detail.coverImageUrl,
                fetchedAt: createdAt,
              },
            }
          : {}),
      },
    }
  }
  if (event.kind === "MEAL") {
    return {
      ...base,
      type: "MEAL",
      detail: {
        ...detail,
        ...(event.detail.cuisine ? { cuisine: event.detail.cuisine } : {}),
      },
    }
  }
  if (event.kind === "ACTIVITY") {
    return {
      ...base,
      type: "ACTIVITY",
      detail: {
        ...detail,
        ...(event.detail.bookingReference
          ? { bookingReference: event.detail.bookingReference }
          : {}),
      },
    }
  }
  return {
    ...base,
    type: "STAY",
    detail: {
      ...detail,
      ...(event.detail.checkInNote
        ? { checkInNote: event.detail.checkInNote }
        : {}),
      hotelOffer: {
        provider: "rollinggo",
        providerHotelId: event.detail.place.providerPlaceId ?? event.eventId,
        ...(event.detail.hotel.address
          ? { address: event.detail.hotel.address }
          : {}),
        ...(event.detail.hotel.startingPrice
          ? { startingPrice: event.detail.hotel.startingPrice }
          : {}),
        ...(event.detail.hotel.coverImageUrl
          ? { coverImageUrl: event.detail.hotel.coverImageUrl }
          : {}),
        ...(event.detail.hotel.externalUrl
          ? { externalUrl: event.detail.hotel.externalUrl }
          : {}),
        fetchedAt: event.detail.hotel.fetchedAt,
      },
    },
  }
}

function transitEvent(
  snapshot: TargetFlatJourneySnapshot,
  event: FlatTransitEvent,
  parentSectionEventId: string | null,
  fromEventId: string,
  toEventId: string,
  run: TargetTransitPlanningRun | null,
  revision: number,
  createdAt: string
): TargetJourneyEvent {
  return {
    ...eventIdentity(
      snapshot,
      event.eventId,
      parentSectionEventId,
      revision,
      createdAt
    ),
    type: "TRANSIT",
    executionStatus: "PLANNED",
    title: event.title,
    ...(event.description ? { description: event.description } : {}),
    ...(event.plannedStartAt ? { plannedStartAt: event.plannedStartAt } : {}),
    ...(event.plannedEndAt ? { plannedEndAt: event.plannedEndAt } : {}),
    detail: {
      plannedFromEventId: fromEventId,
      plannedToEventId: toEventId,
      transportMode: event.detail.transportMode,
      ...(event.detail.preference
        ? { preference: event.detail.preference }
        : {}),
      ...(event.detail.plannedDurationMinutes === undefined
        ? {}
        : { plannedDurationMinutes: event.detail.plannedDurationMinutes }),
      ...(event.detail.plannedDistanceKm === undefined
        ? {}
        : { plannedDistanceKm: event.detail.plannedDistanceKm }),
      ...(run
        ? {
            activePlanningRunId: run.id,
            selectedPlanId: run.plans[0]!.id,
          }
        : {}),
      routeState: run ? event.detail.routeState : "EMPTY",
    },
  }
}

function routeProjection(
  event: FlatTransitEvent,
  from: TargetFlatJourneyEvent | undefined,
  to: TargetFlatJourneyEvent | undefined
): TargetTransitPlanningRun | null {
  if (
    event.detail.routeState !== "READY" ||
    !event.detail.route ||
    !from ||
    from.kind === "TRANSIT" ||
    !to ||
    to.kind === "TRANSIT"
  ) {
    return null
  }
  const runId = `flat-route-run:${event.eventId}`
  const planId = `flat-route-plan:${event.eventId}`
  const distanceMeters = (event.detail.plannedDistanceKm ?? 0) * 1_000
  const durationSeconds = (event.detail.plannedDurationMinutes ?? 0) * 60
  const route = event.detail.route
  return {
    id: runId,
    transitEventId: event.eventId,
    requestFingerprint: `flat-route:${event.eventId}`,
    provider: route.provider,
    status: "READY",
    calculatedAt: route.calculatedAt,
    plans: [
      {
        id: planId,
        planningRunId: runId,
        transitEventId: event.eventId,
        provider: route.provider,
        rank: 0,
        label: route.label,
        strategy: "COMMITTED",
        distanceMeters,
        durationSeconds,
        trafficBasis: "UNKNOWN",
        calculatedAt: route.calculatedAt,
        segments: route.segments.map((segment, index) => ({
          id: `flat-route-segment:${event.eventId}:${index}`,
          order: index,
          mode: segment.mode,
          ...(index === 0 ? { fromName: from.title } : {}),
          ...(index === route.segments.length - 1 ? { toName: to.title } : {}),
          coordinateSystem: segment.coordinateSystem,
          geometryKind: segment.geometryKind,
          positions: segment.positions,
          ...(segment.trafficSections
            ? { trafficSections: segment.trafficSections }
            : {}),
        })),
      },
    ],
  }
}

function sequenceLinks(
  journeyId: string,
  events: readonly { eventId: string }[],
  revision: number,
  prefix = "segment"
) {
  return events.slice(0, -1).map<TargetJourneyEventLink>((event, index) => ({
    id: `${prefix}-link:${event.eventId}:${events[index + 1]!.eventId}`,
    journeyId,
    fromEventId: event.eventId,
    toEventId: events[index + 1]!.eventId,
    kind: "MAIN",
    rank: index,
    introducedRevision: revision,
  }))
}
