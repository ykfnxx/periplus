import { describe, expect, it } from "vitest"
import { eventCalendarDate } from "@/lib/journeys/calendar"
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
})
