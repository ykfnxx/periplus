import { selectedTransitPlan } from "./planning"
import type {
  TargetJourneyEvent,
  TargetTransitPlanningRun,
} from "@/modules/data-model/contracts"

export function eventDurationMinutes(event: TargetJourneyEvent) {
  if (
    event.type === "TRANSIT" ||
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

export function totalDurationMinutes(events: readonly TargetJourneyEvent[]) {
  return events.reduce((total, event) => total + eventDurationMinutes(event), 0)
}

export function totalDurationDays(events: readonly TargetJourneyEvent[]) {
  const timestamps = events
    .flatMap((event) =>
      event.type === "SECTION" || event.type === "NOTE"
        ? []
        : [
            event.actualStartAt ?? event.plannedStartAt,
            event.actualEndAt ?? event.plannedEndAt,
          ]
    )
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
  if (timestamps.length) {
    const span = Math.max(...timestamps) - Math.min(...timestamps)
    return Math.max(1, Math.ceil(span / 86_400_000))
  }
  const minutes = totalDurationMinutes(events)
  return minutes ? Math.max(1, Math.ceil(minutes / 1_440)) : 0
}

export function totalTransitDistanceMeters(
  events: readonly TargetJourneyEvent[],
  runs: readonly TargetTransitPlanningRun[] = []
) {
  return events.reduce((total, event) => {
    if (event.type !== "TRANSIT") return total
    const plan = selectedTransitPlan(event, runs)
    return (
      total +
      (plan?.distanceMeters ?? (event.detail.plannedDistanceKm ?? 0) * 1_000)
    )
  }, 0)
}

export function readyTransitCount(events: readonly TargetJourneyEvent[]) {
  return events.filter(
    (event) => event.type === "TRANSIT" && event.detail.routeState === "READY"
  ).length
}

export function locationCount(events: readonly TargetJourneyEvent[]) {
  return events.filter(
    (event) =>
      event.type === "VISIT" ||
      event.type === "STAY" ||
      event.type === "MEAL" ||
      event.type === "ACTIVITY"
  ).length
}

export function transitEvents(events: readonly TargetJourneyEvent[]) {
  return events.filter(
    (event): event is Extract<TargetJourneyEvent, { type: "TRANSIT" }> =>
      event.type === "TRANSIT"
  )
}
