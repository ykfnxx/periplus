import { eventCalendarDate } from "./calendar"
import type { JourneyEvent } from "@/modules/data-model/contracts"

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
}

export function deriveJourneyDayGroups(
  events: readonly JourneyEvent[]
): JourneyDayProjection {
  const groups: JourneyDayGroup[] = []
  const groupByKey = new Map<string, JourneyDayGroup>()
  const groupKeyByEventId = new Map<string, string>()
  let colorIndex = 0
  for (const event of events) {
    // Date is the event's local calendar fact; navigation never sorts or groups
    // the chain itself and never borrows a parent city's timezone.
    const date = eventCalendarDate(event)
    const key = date ?? UNSCHEDULED_DAY_KEY
    let group = groupByKey.get(key)
    if (!group) {
      const label = date
        ? `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`
        : "日期待补"
      group = {
        key,
        label,
        shortLabel: label,
        eventIds: [],
        firstEventId: event.id,
        colorIndex: date ? colorIndex++ : null,
      }
      groupByKey.set(key, group)
      groups.push(group)
    }
    group.eventIds.push(event.id)
    groupKeyByEventId.set(event.id, key)
  }
  return { groups, groupKeyByEventId }
}
