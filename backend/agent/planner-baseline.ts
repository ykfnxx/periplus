import { createHash } from "node:crypto"
import type { TargetJourneyGraphSnapshot } from "@/modules/data-model/contracts"
import { projectFlatJourney } from "@/modules/data/journeys/flat-journey-projection"

export interface PlannerBaselineEvent {
  eventId: string
  proposalItemKey: string
  kind: "VISIT" | "MEAL" | "ACTIVITY" | "STAY" | "TRANSIT"
  title: string
  description?: string
  city?: string
  plannedStartAt?: string
  plannedEndAt?: string
  plannedDurationMinutes?: number
  cuisine?: string
  bookingReference?: string
  checkInNote?: string
  fromItemKey?: string
  toItemKey?: string
  transportMode?: string
  preference?: string
  place?: {
    name: string
    lat: number
    lng: number
    coordinateSystem: string
    providerPlaceId?: string
  }
}

export interface PlannerBaseline {
  workspaceId: string
  workspaceRevision: number
  projectionHash: string
  graph: TargetJourneyGraphSnapshot
  journey: {
    title: string
    description?: string
    events: PlannerBaselineEvent[]
  }
}

export function baselineItemKey(index: number) {
  return `baseline-${String(index + 1).padStart(4, "0")}`
}

export function buildPlannerBaseline(input: {
  workspaceId: string
  workspaceRevision: number
  graph: TargetJourneyGraphSnapshot
}): PlannerBaseline {
  const flat = projectFlatJourney(input.graph, input.workspaceRevision)
  const keyByEventKey = new Map(
    flat.events.map((event, index) => [event.eventId, baselineItemKey(index)])
  )
  const events: PlannerBaselineEvent[] = flat.events.map((event, index) => {
    const base = {
      eventId: event.eventId,
      proposalItemKey: baselineItemKey(index),
      kind: event.kind,
      title: event.title,
      ...(event.description ? { description: event.description } : {}),
      ...(event.plannedStartAt ? { plannedStartAt: event.plannedStartAt } : {}),
      ...(event.plannedEndAt ? { plannedEndAt: event.plannedEndAt } : {}),
    }
    if (event.kind !== "TRANSIT") {
      return {
        ...base,
        city: event.city.name,
        place: {
          name: event.detail.place.name,
          lat: event.detail.place.lat,
          lng: event.detail.place.lng,
          coordinateSystem: event.detail.place.coordinateSystem,
          ...(event.detail.place.providerPlaceId
            ? { providerPlaceId: event.detail.place.providerPlaceId }
            : {}),
        },
        ...(event.detail.plannedDurationMinutes === undefined
          ? {}
          : {
              plannedDurationMinutes: event.detail.plannedDurationMinutes,
            }),
        ...(event.kind === "MEAL" && event.detail.cuisine
          ? { cuisine: event.detail.cuisine }
          : {}),
        ...(event.kind === "ACTIVITY" && event.detail.bookingReference
          ? { bookingReference: event.detail.bookingReference }
          : {}),
        ...(event.kind === "STAY" && event.detail.checkInNote
          ? { checkInNote: event.detail.checkInNote }
          : {}),
      }
    }
    return {
      ...base,
      fromItemKey:
        keyByEventKey.get(event.detail.fromEventKey) ??
        event.detail.fromEventKey,
      toItemKey:
        keyByEventKey.get(event.detail.toEventKey) ?? event.detail.toEventKey,
      transportMode: event.detail.transportMode,
      ...(event.detail.preference
        ? { preference: event.detail.preference }
        : {}),
    }
  })
  const journey = {
    title: flat.title,
    ...(flat.description ? { description: flat.description } : {}),
    events,
  }
  return {
    workspaceId: input.workspaceId,
    workspaceRevision: input.workspaceRevision,
    projectionHash: createHash("sha256")
      .update(JSON.stringify(journey))
      .digest("hex"),
    graph: input.graph,
    journey,
  }
}
