import type { JourneyEvent } from "@/modules/data-model/contracts"

export function eventCalendarDate(event: JourneyEvent): string {
  return event.date
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
