import type { JourneyEvent } from "@/modules/data-model/contracts"

export function eventCalendarDate(event: JourneyEvent): string | null {
  if (event.date) return event.date
  const instant = event.actualStartAt ?? event.planning?.startAt
  if (!instant || !event.timeZone) return null
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: event.timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
        .formatToParts(new Date(instant))
        .map((part) => [part.type, part.value])
    )
    return `${parts.year}-${parts.month}-${parts.day}`
  } catch {
    return null
  }
}

export function eventInstantLabel(
  value: string,
  timeZone: string | null
): string {
  const options: Intl.DateTimeFormatOptions = {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }
  try {
    return (
      new Intl.DateTimeFormat("zh-CN", {
        ...options,
        timeZone: timeZone ?? "UTC",
      }).format(new Date(value)) + (timeZone ? "" : " UTC")
    )
  } catch {
    return value
  }
}
