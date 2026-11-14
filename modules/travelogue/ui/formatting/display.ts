import { coordinateToWgs84 } from "@/lib/journeys/coordinates"
import type {
  JourneyEvent,
  JourneySummary,
} from "@/modules/data-model/contracts/index"

export function dateLabel(date: string) {
  const [, month, day] = date.split("-")
  return `${Number(month)}月${Number(day)}日`
}

export function journeyDateLabel(
  journey: Pick<JourneySummary, "startDate" | "endDate">
) {
  if (!journey.startDate) return ""
  return journey.endDate && journey.endDate !== journey.startDate
    ? `${dateLabel(journey.startDate)} — ${dateLabel(journey.endDate)}`
    : dateLabel(journey.startDate)
}

export function eventTitle(event: Pick<JourneyEvent, "title" | "body">) {
  return (
    event.title || event.body.trim().split("\n")[0]?.slice(0, 40) || "一段经历"
  )
}

export function recordingCoordinateToMap(
  coordinates: NonNullable<NonNullable<JourneyEvent["location"]>["coordinates"]>
) {
  const { lng, lat, coordinateSystem } = coordinates
  const pair = coordinateToWgs84(lng, lat, coordinateSystem)
  return { lng: pair[0], lat: pair[1] }
}
