import { createHash } from "node:crypto"
import type {
  TargetJourneyEvent,
  TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import { resolveJourneyProjection } from "@/modules/data/journeys/journey-projection"

function activeAtRevision(
  value: { introducedRevision: number; retiredRevision?: number | null },
  revision: number
) {
  return (
    value.introducedRevision <= revision &&
    (!value.retiredRevision || value.retiredRevision > revision)
  )
}

function card(event: TargetJourneyEvent) {
  const identity = {
    cardId: event.id,
    type:
      event.type === "SECTION" && event.detail.kind === "CITY"
        ? ("CITY" as const)
        : event.type,
    title: event.title,
    ...(event.description ? { description: event.description } : {}),
  }
  if (event.type === "SECTION") {
    return { ...identity, timeZone: event.detail.timeZone }
  }
  if (event.type === "NOTE") {
    return { ...identity, body: event.detail.body }
  }
  const schedule = {
    ...(event.plannedStartAt ? { plannedStartAt: event.plannedStartAt } : {}),
    ...(event.plannedEndAt ? { plannedEndAt: event.plannedEndAt } : {}),
  }
  if (event.type === "TRANSIT") {
    return {
      ...identity,
      ...schedule,
      fromCardId: event.detail.plannedFromEventId,
      toCardId: event.detail.plannedToEventId,
      transportMode: event.detail.transportMode,
      routeState: event.detail.routeState,
      ...(event.detail.plannedDurationMinutes === undefined
        ? {}
        : { plannedDurationMinutes: event.detail.plannedDurationMinutes }),
      ...(event.detail.plannedDistanceKm === undefined
        ? {}
        : { plannedDistanceKm: event.detail.plannedDistanceKm }),
    }
  }
  return {
    ...identity,
    ...schedule,
    place: {
      ...(event.detail.plannedPlaceId
        ? { placeId: event.detail.plannedPlaceId }
        : {}),
      canonicalName: event.title,
      plannedLat: event.detail.plannedLat,
      plannedLng: event.detail.plannedLng,
      coordinateSystem: event.detail.coordinateSystem,
      ...(event.detail.coordinateProvider
        ? { provider: event.detail.coordinateProvider }
        : {}),
      ...(event.detail.providerPlaceId
        ? { providerPlaceId: event.detail.providerPlaceId }
        : {}),
    },
  }
}

function orderedScope(
  graph: TargetJourneyGraphSnapshot,
  scopeCityCardId: string | null
) {
  const byId = new Map(graph.events.map((event) => [event.id, event]))
  return resolveJourneyProjection({
    graph,
    scopeSectionEventId: scopeCityCardId,
    mode: "PLANNER",
  }).events.flatMap((entry) => {
    const event = byId.get(entry.eventId)
    return event ? [card(event)] : []
  })
}

function isActiveRootCity(
  event: TargetJourneyEvent,
  revision: number
): event is Extract<TargetJourneyEvent, { type: "SECTION" }> {
  return (
    event.type === "SECTION" &&
    event.detail.kind === "CITY" &&
    event.parentSectionEventId === null &&
    event.placementStatus === "SCHEDULED" &&
    activeAtRevision(event, revision)
  )
}

export interface PlannerBaseline {
  workspaceId: string
  journeyId: string
  workspaceRevision: number
  graphRevision: number
  projectionHash: string
  root: ReturnType<typeof orderedScope>
  cities: Array<{
    cityCardId: string
    name: string
    timeZone: string
    cards: ReturnType<typeof orderedScope>
  }>
}

export function buildPlannerBaseline(input: {
  workspaceId: string
  workspaceRevision: number
  graph: TargetJourneyGraphSnapshot
}): PlannerBaseline {
  const root = orderedScope(input.graph, null)
  const cities = input.graph.events
    .filter((event) => isActiveRootCity(event, input.graph.revision))
    .map((event) => ({
      cityCardId: event.id,
      name: event.title,
      timeZone: event.detail.timeZone,
      cards: orderedScope(input.graph, event.id),
    }))
    .sort((a, b) => {
      const left = root.findIndex((entry) => entry.cardId === a.cityCardId)
      const right = root.findIndex((entry) => entry.cardId === b.cityCardId)
      return left - right
    })
  const projectionHash = createHash("sha256")
    .update(JSON.stringify({ root, cities }))
    .digest("hex")
  return {
    workspaceId: input.workspaceId,
    journeyId: input.graph.id,
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graph.revision,
    projectionHash,
    root,
    cities,
  }
}
