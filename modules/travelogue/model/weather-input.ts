import type { JourneyEvent } from "@/modules/data-model/contracts/index"

// Preserve displayed weather through content-only saves, but not input changes.
export function weatherInput(event: JourneyEvent) {
  return JSON.stringify([
    event.category,
    event.date,
    event.time,
    event.timeZone,
    event.startAt,
    event.endAt,
    event.location?.coordinates?.lng,
    event.location?.coordinates?.lat,
    event.location?.coordinates?.coordinateSystem,
  ])
}
