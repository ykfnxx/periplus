import { describe, expect, it } from "vitest"
import {
  eventContent,
  eventContentPatch,
  eventLocalDateTime,
  eventTimeInstant,
} from "@/modules/travelogue/ui/event-content"
import { paperCardJourney } from "@/tests/storybook/paper-card-fixture"

describe("dated event editing", () => {
  it("edits one time without resending the other time or provider facts", () => {
    const baseline = eventContent(paperCardJourney.events[1])
    const draft = {
      ...baseline,
      planning: { ...baseline.planning, endAt: null },
    }
    expect(eventContentPatch(draft, baseline)).toEqual({
      planning: { endAt: null },
    })
    expect(
      eventContentPatch(
        {
          ...baseline,
          planning: { ...baseline.planning, startAt: null },
          time: null,
        },
        baseline
      )
    ).toEqual({ time: null, planning: { startAt: null } })
  })
  it("keeps the event's local date and time across ISO round trips", () => {
    const instant = eventTimeInstant("2026-10-19T01:00", "Asia/Shanghai")
    expect(instant).toBe("2026-10-18T17:00:00.000Z")
    expect(eventLocalDateTime(instant, "Asia/Shanghai")).toBe(
      "2026-10-19T01:00"
    )
    expect(eventTimeInstant("2026-10-18T23:20", "America/Los_Angeles")).toBe(
      "2026-10-19T06:20:00.000Z"
    )
  })
  it("keeps cleared times empty when a saved event is reopened", () => {
    const original = paperCardJourney.events[1]
    const draft = eventContent({ ...original, time: null, planning: undefined })
    expect(draft.planning).toEqual({ startAt: null, endAt: null })
    expect(eventLocalDateTime(draft.planning.endAt, draft.timeZone)).toBe("")
  })
})
