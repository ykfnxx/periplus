import type { JourneyEvent } from "@/modules/data-model/contracts"
import {
  formatTransitDistance,
  formatTransitDuration,
} from "@/lib/journeys/display"

export const eventCategoryLabels = {
  VISIT: "游览",
  MEAL: "餐饮",
  STAY: "住宿",
  TRANSIT: "交通",
}

export function eventCardTitle(
  event: Pick<JourneyEvent, "title" | "category">
) {
  return (
    event.title ||
    (event.category ? eventCategoryLabels[event.category] : "随记")
  )
}

export function eventCity(event: JourneyEvent | undefined) {
  // A free-form place name or address is not a city. Unknown city stays absent.
  return event?.location?.city?.trim() || null
}

function instantClock(value: string | undefined, timeZone: string | null) {
  if (!value) return null
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timeZone || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value])
  )
  return {
    time: `${parts.hour}:${parts.minute}${timeZone ? "" : " UTC"}`,
    date: `${parts.year}-${parts.month}-${parts.day}`,
  }
}

export function eventCardTimes(
  event: Pick<JourneyEvent, "date" | "time" | "timeZone" | "startAt" | "endAt">
) {
  const start = instantClock(event.startAt, event.timeZone)
  const end = instantClock(event.endAt, event.timeZone)
  const departure = event.time || start?.time || null
  const startDate = event.date || start?.date
  // Keep an overnight arrival visibly on its own date rather than implying the
  // train/flight arrived before it departed. Never derive an arrival from ETA.
  const arrivalDate =
    end && startDate && end.date !== startDate
      ? `${Number(end.date.slice(5, 7))}月${Number(end.date.slice(8))}日`
      : null
  const arrivalDays =
    end && startDate
      ? Math.round(
          (Date.parse(`${end.date}T00:00:00Z`) -
            Date.parse(`${startDate}T00:00:00Z`)) /
            86_400_000
        )
      : 0
  const arrival = end?.time || null
  const arrivalLabel = [arrivalDate, arrival].filter(Boolean).join(" ")
  return {
    departure,
    arrival,
    arrivalDate,
    arrivalDays,
    range: departure
      ? [departure, arrivalLabel].filter(Boolean).join("–")
      : arrivalLabel
        ? `至 ${arrivalLabel}`
        : "",
  }
}

export function eventTransitDisplay(
  event: Pick<JourneyEvent, "transit" | "startAt" | "endAt">
) {
  const plan =
    event.transit?.routeState === "READY"
      ? event.transit.route?.plans[0]
      : undefined
  const mode = event.transit?.transportMode
  const modes = {
    WALK: "步行",
    BUS: "公交",
    SUBWAY: "地铁",
    TRAIN: "火车",
    FLIGHT: "飞机",
    CAR: "驾车",
    TAXI: "出租车",
    RENTAL: "租车",
  }
  return {
    mode: mode ? modes[mode] : "交通",
    duration: (() => {
      const start = event.startAt
      const end = event.endAt
      if (!start || !end) return null
      const seconds = (Date.parse(end) - Date.parse(start)) / 1000
      return seconds === 0 ? "0 分钟" : formatTransitDuration(seconds)
    })(),
    distance:
      event.transit?.distanceMeters !== undefined
        ? formatTransitDistance(event.transit.distanceMeters)
        : null,
    line: plan
      ? Array.from(
          new Set(plan.segments.flatMap((segment) => segment.lineName || []))
        ).join(" · ") || plan.label
      : null,
  }
}
