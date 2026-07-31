import { executableEvents } from "./projections"
import { selectedTransitPlan } from "./planning"
import type {
  JourneyEvent,
  LocationJourneyEvent,
  TransitEvent,
} from "@/types/journey"

export function eventDurationMinutes(event: JourneyEvent) {
  if (event.type === "TRANSIT") {
    return (
      event.detail.actualDurationMinutes ??
      event.detail.plannedDurationMinutes ??
      0
    )
  }
  if (
    event.type === "VISIT" ||
    event.type === "STAY" ||
    event.type === "MEAL" ||
    event.type === "ACTIVITY"
  ) {
    return (
      event.detail.actualDurationMinutes ??
      event.detail.plannedDurationMinutes ??
      0
    )
  }
  return 0
}

export function totalDurationMinutes(events: readonly JourneyEvent[]) {
  return executableEvents(events).reduce(
    (total, event) => total + eventDurationMinutes(event),
    0
  )
}

export function totalDurationDays(events: readonly JourneyEvent[]) {
  const datedEvents = events.filter(
    (event) => event.plannedStartAt || event.actualStartAt
  )
  if (datedEvents.length) {
    const timestamps = datedEvents
      .flatMap((event) => [
        event.actualStartAt ?? event.plannedStartAt,
        event.actualEndAt ?? event.plannedEndAt,
      ])
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter(Number.isFinite)
    if (timestamps.length) {
      const span = Math.max(...timestamps) - Math.min(...timestamps)
      return Math.max(1, Math.ceil(span / 86_400_000))
    }
  }
  const minutes = totalDurationMinutes(events)
  return minutes ? Math.max(1, Math.ceil(minutes / 1_440)) : 0
}

export function totalTransitDistanceMeters(events: readonly JourneyEvent[]) {
  return events.reduce((total, event) => {
    if (event.type !== "TRANSIT") return total
    const plan = selectedTransitPlan(event)
    return (
      total +
      (plan?.distanceMeters ?? (event.detail.plannedDistanceKm ?? 0) * 1_000)
    )
  }, 0)
}

export function readyTransitCount(events: readonly JourneyEvent[]) {
  return events.filter(
    (event) =>
      event.type === "TRANSIT" && event.detail.planningStatus === "READY"
  ).length
}

export function locationCount(events: readonly JourneyEvent[]) {
  return events.filter(
    (event): event is LocationJourneyEvent =>
      event.type === "VISIT" ||
      event.type === "STAY" ||
      event.type === "MEAL" ||
      event.type === "ACTIVITY"
  ).length
}

export function transitEvents(events: readonly JourneyEvent[]) {
  return events.filter(
    (event): event is TransitEvent => event.type === "TRANSIT"
  )
}
