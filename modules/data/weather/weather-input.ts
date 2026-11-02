import { createHash } from "node:crypto"
import type { JourneyEvent } from "@/modules/data-model/contracts"
import { bd09ToGcj02, gcj02ToWgs84 } from "@/lib/journeys/coordinates"

export interface WeatherInput {
  key: string
  latitude: number
  longitude: number
  date: string
  timeZone: string
  instant: number | null
}

export function localWeatherTime(instant: number, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

function eventInstant(event: JourneyEvent) {
  if (!event.time || !event.timeZone) return null
  const local = `${event.date}T${event.time}`
  const saved = event.startAt
  // An explicit instant disambiguates a repeated local hour at a DST transition.
  if (saved && localWeatherTime(Date.parse(saved), event.timeZone) === local)
    return Date.parse(saved)
  const formatter = new Intl.DateTimeFormat("en", {
    timeZone: event.timeZone,
    timeZoneName: "longOffset",
  })
  const localEpoch = Date.parse(`${local}:00Z`)
  const matches = new Set<number>()
  // Inspect offsets on both sides of the local day. A clock rollback can make
  // two real instants match; without an explicit startAt neither is justified.
  for (const probe of [-86_400_000, 0, 86_400_000]) {
    const offset = formatter
      .formatToParts(localEpoch + probe)
      .find((part) => part.type === "timeZoneName")!
      .value.replace("GMT", "")
    // Historical IANA offsets can include seconds, which an ISO offset string
    // cannot express. Subtract their numeric value instead of parsing that string.
    const [hours = 0, minutes = 0, seconds = 0] = offset
      .slice(1)
      .split(":")
      .map(Number)
    const direction = offset.startsWith("-") ? -1 : 1
    const instant =
      localEpoch - direction * (hours * 3600 + minutes * 60 + seconds) * 1000
    if (localWeatherTime(instant, event.timeZone) === local)
      matches.add(instant)
  }
  // Skipped hours have zero matches; repeated hours have more than one.
  return matches.size === 1 ? [...matches][0] : null
}

export function eventWeatherInput(event: JourneyEvent): WeatherInput | null {
  const coordinates = event.location?.coordinates
  if (event.category === "TRANSIT" || !coordinates || !event.timeZone)
    return null
  let { lng, lat } = coordinates
  if (coordinates.coordinateSystem === "BD09")
    [lng, lat] = bd09ToGcj02(lng, lat)
  if (coordinates.coordinateSystem !== "WGS84")
    [lng, lat] = gcj02ToWgs84(lng, lat)
  const instant = eventInstant(event)
  if (event.time && instant === null) return null
  const key = createHash("sha256")
    .update(
      JSON.stringify({
        coordinates,
        date: event.date,
        time: event.time,
        timeZone: event.timeZone,
        startAt: event.startAt ?? null,
      })
    )
    .digest("hex")
  return {
    key,
    latitude: lat,
    longitude: lng,
    date: event.date,
    timeZone: event.timeZone,
    instant,
  }
}
