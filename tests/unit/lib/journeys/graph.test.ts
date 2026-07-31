import { describe, expect, it } from "vitest"
import {
  projectMainSequence,
  projectTopologicalSequence,
  validateJourneyGraph,
} from "@/lib/journeys/graph"
import {
  executableEvents,
  getJourneyScopeProjection,
} from "@/lib/journeys/projections"
import { locationCount } from "@/lib/journeys/summary"
import type { JourneyInput } from "@/types/journey"

function journey(): JourneyInput {
  return {
    title: "测试行程",
    status: "DRAFT",
    events: [
      {
        id: "section-a",
        type: "SECTION",
        origin: "ORIGINAL",
        title: "第一天",
        detail: { kind: "DAY" },
      },
      {
        id: "section-b",
        type: "SECTION",
        origin: "ORIGINAL",
        title: "第二天",
        detail: { kind: "DAY" },
      },
      {
        id: "visit-a",
        parentEventId: "section-a",
        type: "VISIT",
        executionStatus: "PLANNED",
        origin: "ORIGINAL",
        title: "A",
        detail: { plannedLat: 30, plannedLng: 120 },
      },
      {
        id: "visit-b",
        parentEventId: "section-b",
        type: "VISIT",
        executionStatus: "PLANNED",
        origin: "ORIGINAL",
        title: "B",
        detail: { plannedLat: 31, plannedLng: 121 },
      },
    ],
    links: [
      {
        id: "top-link",
        fromEventId: "section-a",
        toEventId: "section-b",
        kind: "MAIN",
      },
    ],
  }
}

describe("JourneyEvent graph", () => {
  it("projects a stable MAIN sequence", () => {
    const input = journey()
    expect(projectMainSequence(input).map((event) => event.id)).toEqual([
      "section-a",
      "section-b",
    ])
    expect(validateJourneyGraph(input)).toEqual({ ok: true })
  })

  it("projects ALTERNATIVE-only branch events in the all-link DAG", () => {
    const input = journey()
    input.events.push({
      id: "branch-note",
      type: "NOTE",
      origin: "USER_INSERTED",
      title: "雨天备选",
      detail: { body: "室内活动" },
    })
    input.links.push(
      {
        id: "branch-start",
        fromEventId: "section-a",
        toEventId: "branch-note",
        kind: "ALTERNATIVE",
        branchKey: "rain",
      },
      {
        id: "branch-end",
        fromEventId: "branch-note",
        toEventId: "section-b",
        kind: "ALTERNATIVE",
        branchKey: "rain",
      }
    )

    expect(validateJourneyGraph(input)).toEqual({ ok: true })
    expect(projectMainSequence(input).map((event) => event.id)).toEqual([
      "section-a",
      "section-b",
    ])
    expect(projectTopologicalSequence(input).map((event) => event.id)).toEqual([
      "section-a",
      "branch-note",
      "section-b",
    ])
    expect(
      getJourneyScopeProjection(input, "overview", null).events.map(
        (event) => event.id
      )
    ).toEqual(["section-a", "branch-note", "section-b"])
  })

  it("rejects cycles formed across MAIN and ALTERNATIVE links", () => {
    const input = journey()
    input.links.push({
      id: "cycle",
      fromEventId: "section-b",
      toEventId: "section-a",
      kind: "ALTERNATIVE",
    })

    expect(validateJourneyGraph(input)).toEqual({
      ok: false,
      error: "links in scope __root__ must form an acyclic graph",
    })
  })

  it("does not count SECTION as a visit or executable event", () => {
    const input = journey()
    expect(locationCount(input.events)).toBe(2)
    expect(executableEvents(input.events).map((event) => event.id)).toEqual([
      "visit-a",
      "visit-b",
    ])
  })

  it("rejects links whose endpoints do not have the exact same parent scope", () => {
    const input = journey()
    input.links.push({
      id: "cross-scope",
      fromEventId: "visit-a",
      toEventId: "visit-b",
      kind: "ALTERNATIVE",
    })
    expect(validateJourneyGraph(input)).toEqual({
      ok: false,
      error: "link cross-scope endpoints must share parentEventId",
    })
  })

  it("rejects graphs that mix journey ids", () => {
    const input = journey()
    input.events[0]!.journeyId = "journey-a"
    input.events[1]!.journeyId = "journey-b"
    expect(validateJourneyGraph(input)).toEqual({
      ok: false,
      error: "journey graph contains mixed journeyId values",
    })
  })

  it("rejects parent cycles", () => {
    const input = journey()
    input.events[0]!.parentEventId = "section-b"
    input.events[1]!.parentEventId = "section-a"
    input.links = []
    expect(validateJourneyGraph(input)).toEqual({
      ok: false,
      error: "parent cycle includes event section-a",
    })
  })

  it("allows only SECTION events to own containment", () => {
    const input = journey()
    input.events.find((event) => event.id === "visit-b")!.parentEventId =
      "visit-a"
    expect(validateJourneyGraph(input)).toEqual({
      ok: false,
      error: "event visit-b parent must be a SECTION",
    })
  })
})
