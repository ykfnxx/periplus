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
})
