import { bd09ToGcj02, wgs84ToGcj02 } from "@/lib/journeys/coordinates"
import type {
  RecordingEvent,
  RecordingJourneySummary,
} from "@/modules/data-model/contracts/recording"
import type { RecordDay } from "./RecordDateNav"

export function dateLabel(date: string) {
  const [, month, day] = date.split("-")
  return `${Number(month)}月${Number(day)}日`
}

export function journeyDateLabel(
  journey: Pick<RecordingJourneySummary, "startDate" | "endDate">
) {
  if (!journey.startDate) return "日期待补"
  return journey.endDate && journey.endDate !== journey.startDate
    ? `${dateLabel(journey.startDate)} — ${dateLabel(journey.endDate)}`
    : dateLabel(journey.startDate)
}

export function recordingDays(events: RecordingEvent[]): RecordDay[] {
  const days = new Map<string, RecordDay>()
  for (const event of events) {
    const key = event.date || "undated"
    if (!days.has(key))
      days.set(key, {
        key,
        label: event.date ? dateLabel(event.date) : "未标日期",
        firstEventId: event.id,
      })
  }
  return [...days.values()]
}

export function eventTitle(event: Pick<RecordingEvent, "title" | "body">) {
  return (
    event.title || event.body.trim().split("\n")[0]?.slice(0, 40) || "一段经历"
  )
}

export function recordingCoordinateToMap(
  coordinates: NonNullable<
    NonNullable<RecordingEvent["location"]>["coordinates"]
  >
) {
  const { lng, lat, coordinateSystem } = coordinates
  const pair =
    coordinateSystem === "WGS84"
      ? wgs84ToGcj02(lng, lat)
      : coordinateSystem === "BD09"
        ? bd09ToGcj02(lng, lat)
        : [lng, lat]
  return { lng: pair[0], lat: pair[1] }
}
