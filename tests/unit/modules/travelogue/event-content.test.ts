import { describe, expect, it } from "vitest"
import {
  eventContent,
  eventContentPatch,
  eventLocalDateTime,
  eventTimeInstant,
} from "@/modules/travelogue/model/event-draft"
import { eventCardJourney } from "@/tests/fixtures/event-card"

describe("dated event editing", () => {
  it("edits one time without resending the other time or provider facts", () => {
    const baseline = eventContent(eventCardJourney.events[1])
    const draft = {
      ...baseline,
      endAt: null,
    }
    expect(eventContentPatch(draft, baseline)).toEqual({
      endAt: null,
    })
    expect(
      eventContentPatch(
        {
          ...baseline,
          startAt: null,
          time: null,
        },
        baseline
      )
    ).toEqual({ time: null, startAt: null })
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
  it.each([
    ["2026-03-08T03:30", "2026-03-08T10:30:00.000Z"],
    ["2026-11-01T02:30", "2026-11-01T10:30:00.000Z"],
  ])(
    "preserves %s across a daylight-saving transition and reopening",
    (local, expected) => {
      const instant = eventTimeInstant(local, "America/Los_Angeles")
      expect(instant).toBe(expected)
      expect(eventLocalDateTime(instant, "America/Los_Angeles")).toBe(local)
    }
  )
  it("keeps cleared times empty when a saved event is reopened", () => {
    const original = eventCardJourney.events[1]
    const draft = eventContent({
      ...original,
      time: null,
      startAt: undefined,
      endAt: undefined,
    })
    expect(draft.startAt).toBeNull()
    expect(draft.endAt).toBeNull()
    expect(eventLocalDateTime(draft.endAt, draft.timeZone)).toBe("")
  })
})
