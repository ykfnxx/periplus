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

export function eventCardTitle(event: JourneyEvent) {
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

export function eventCardTimes(event: JourneyEvent) {
  const start = instantClock(
    event.actualStartAt ?? event.planning?.startAt,
    event.timeZone
  )
  const end = instantClock(
    event.actualStartAt ? event.actualEndAt : event.planning?.endAt,
    event.timeZone
  )
  const departure = event.time || start?.time || null
  const startDate = event.date || start?.date
  // Keep an overnight arrival visibly on its own date rather than implying the
  // train/flight arrived before it departed. Never derive an arrival from ETA.
  const arrival = end
    ? `${startDate && end.date !== startDate ? `${Number(end.date.slice(5, 7))}月${Number(end.date.slice(8))}日 ` : ""}${end.time}`
    : null
  return {
    departure,
    arrival,
    range: [departure, arrival].filter(Boolean).join("–"),
  }
}

export function eventTransitDisplay(event: JourneyEvent) {
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
      const start = event.actualStartAt ?? event.planning?.startAt
      const end = event.actualStartAt
        ? event.actualEndAt
        : event.planning?.endAt
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
