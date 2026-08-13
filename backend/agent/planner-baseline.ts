import { createHash } from "node:crypto"
import type { TargetJourneyGraphSnapshot } from "@/modules/data-model/contracts"
import { projectFlatJourney } from "@/modules/data/journeys/flat-journey-projection"

export interface PlannerBaselineEvent {
  proposalItemKey: string
  kind: "VISIT" | "MEAL" | "ACTIVITY" | "STAY" | "TRANSIT"
  title: string
  city?: string
  plannedStartAt?: string
  plannedEndAt?: string
  fromItemKey?: string
  toItemKey?: string
  transportMode?: string
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
      proposalItemKey: baselineItemKey(index),
      kind: event.kind,
      title: event.title,
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
    journey,
  }
}
