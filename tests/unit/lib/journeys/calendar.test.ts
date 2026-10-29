import { describe, expect, it } from "vitest"
import { eventCalendarDate } from "@/lib/journeys/calendar"
import { deriveJourneyDayGroups } from "@/lib/journeys/day-groups"
import { singleChainJourney } from "@/tests/storybook/journey-fixtures"
describe("event-local calendar navigation", () => {
  const base = singleChainJourney.events[0]
  it("preserves date-only facts without inventing a time", () => {
    expect(
      eventCalendarDate({
        ...base,
        date: "2026-10-29",
        time: null,
        timeZone: null,
      })
    ).toBe("2026-10-29")
  })
  it("uses each event timezone rather than the browser or a parent city", () => {
    const event = {
      ...base,
      date: null,
      planning: { startAt: "2026-10-29T01:00:00Z" },
    }
    expect(eventCalendarDate({ ...event, timeZone: "Asia/Shanghai" })).toBe(
      "2026-10-29"
    )
    expect(
      eventCalendarDate({ ...event, timeZone: "America/Los_Angeles" })
    ).toBe("2026-10-28")
    expect(eventCalendarDate({ ...event, timeZone: null })).toBeNull()
    expect(eventCalendarDate({ ...event, timeZone: "invalid" })).toBeNull()
  })
  it("keeps navigation in first-appearance order and keeps unlocated records", () => {
    const events = [
      { ...base, id: "late", date: "2026-10-29" },
      { ...base, id: "early", date: "2026-10-20" },
      { ...base, id: "return", date: "2026-10-29" },
      { ...base, id: "note", date: null, location: null },
    ]
    const result = deriveJourneyDayGroups(events)
    expect(result.groups.map((group) => group.key)).toEqual([
      "2026-10-29",
      "2026-10-20",
      "unscheduled",
    ])
    expect(result.groups[0].eventIds).toEqual(["late", "return"])
    expect(events.map((event) => event.id)).toEqual([
      "late",
      "early",
      "return",
      "note",
    ])
  })
})
