import { describe, expect, it } from "vitest"
import { deriveSectionTimes } from "@/lib/journeys/sections"
import type { JourneyInput, SectionEvent } from "@/types/journey"

describe("SECTION time windows", () => {
  it("derives a non-empty section window from direct children", () => {
    const input: JourneyInput = {
      title: "时间",
      status: "DRAFT",
      events: [
        {
          id: "section",
          type: "SECTION",
          origin: "ORIGINAL",
          title: "一天",
          plannedStartAt: "2030-01-01T00:00:00.000Z",
          detail: { kind: "DAY" },
        },
        {
          id: "visit",
          parentEventId: "section",
          type: "VISIT",
          executionStatus: "PLANNED",
          origin: "ORIGINAL",
          title: "景点",
          plannedStartAt: "2026-08-02T02:00:00.000Z",
          plannedEndAt: "2026-08-02T04:00:00.000Z",
          detail: { plannedLat: 30, plannedLng: 120 },
        },
      ],
      links: [],
    }

    deriveSectionTimes(input)
    const section = input.events[0] as SectionEvent
    expect(section.plannedStartAt).toBe("2026-08-02T02:00:00.000Z")
    expect(section.plannedEndAt).toBe("2026-08-02T04:00:00.000Z")
  })

  it("preserves an explicit window on an empty section", () => {
    const input: JourneyInput = {
      title: "空分组",
      status: "DRAFT",
      events: [
        {
          id: "section",
          type: "SECTION",
          origin: "ORIGINAL",
          title: "自由时间",
          plannedStartAt: "2026-08-02T02:00:00.000Z",
          plannedEndAt: "2026-08-02T04:00:00.000Z",
          detail: { kind: "DAY" },
        },
      ],
      links: [],
    }

    deriveSectionTimes(input)
    expect(input.events[0]?.plannedStartAt).toBe("2026-08-02T02:00:00.000Z")
    expect(input.events[0]?.plannedEndAt).toBe("2026-08-02T04:00:00.000Z")
  })
})
