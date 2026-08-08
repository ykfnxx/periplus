import type { TargetJourneyEvent } from "@/modules/data-model/contracts"

export const UNSCHEDULED_DAY_KEY = "unscheduled"

export interface JourneyDayGroup {
  key: string
  label: string
  shortLabel: string
  eventIds: string[]
  firstEventId: string
  colorIndex: number | null
}

export interface JourneyDayProjection {
  groups: JourneyDayGroup[]
  groupKeyByEventId: Map<string, string>
  hasValidTimeZone: boolean
}

interface DayLabel {
  key: string
}

export function deriveJourneyDayGroups(
  events: readonly TargetJourneyEvent[],
  timeZone: string
): JourneyDayProjection {
  const formatters = createFormatters(timeZone)
  if (!formatters) {
    return {
      groups: [],
      groupKeyByEventId: new Map(),
      hasValidTimeZone: false,
    }
  }

  const groups: JourneyDayGroup[] = []
  const groupByKey = new Map<string, JourneyDayGroup>()
  const groupKeyByEventId = new Map<string, string>()
  let nextColorIndex = 0

  for (const event of events) {
    const dayLabel = eventDayLabel(event, formatters)
    const key = dayLabel?.key ?? UNSCHEDULED_DAY_KEY
    let group = groupByKey.get(key)

    if (!group) {
      group = dayLabel
        ? {
            key: dayLabel.key,
            label: `第 ${nextColorIndex + 1} 天`,
            shortLabel: `第 ${nextColorIndex + 1} 天`,
            eventIds: [],
            firstEventId: event.id,
            colorIndex: nextColorIndex++,
          }
        : {
            key: UNSCHEDULED_DAY_KEY,
            label: "未排期",
            shortLabel: "未排期",
            eventIds: [],
            firstEventId: event.id,
            colorIndex: null,
          }
      groupByKey.set(key, group)
      groups.push(group)
    }

    group.eventIds.push(event.id)
    groupKeyByEventId.set(event.id, key)
  }

  return { groups, groupKeyByEventId, hasValidTimeZone: true }
}

function createFormatters(timeZone: string) {
  try {
    return {
      date: new Intl.DateTimeFormat("en-US", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }),
    }
  } catch {
    return null
  }
}

function eventDayLabel(
  event: TargetJourneyEvent,
  formatters: NonNullable<ReturnType<typeof createFormatters>>
): DayLabel | null {
  if (!("plannedStartAt" in event) || !event.plannedStartAt) return null

  const instant = new Date(event.plannedStartAt)
  if (Number.isNaN(instant.getTime())) return null

  try {
    const dateParts = Object.fromEntries(
      formatters.date
        .formatToParts(instant)
        .map((part) => [part.type, part.value])
    )
    const key = `${dateParts.year}-${dateParts.month}-${dateParts.day}`
    return { key }
  } catch {
    return null
  }
}
