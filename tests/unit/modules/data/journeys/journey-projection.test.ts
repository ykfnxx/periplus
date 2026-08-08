import { describe, expect, it } from "vitest"
import {
  TARGET_CONTRACT_FIXTURES,
  type TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import {
  JourneyProjectionError,
  resolveJourneyProjection,
} from "@/modules/data/journeys/journey-projection"

function scenario(fixtureId: string, caseId: string) {
  const value = TARGET_CONTRACT_FIXTURES.find(
    (fixture) => fixture.id === fixtureId
  )?.cases.find((candidate) => candidate.id === caseId)
  if (!value) throw new Error(`missing fixture ${fixtureId}/${caseId}`)
  return value
}

function graph(fixtureId: string, caseId: string): TargetJourneyGraphSnapshot {
  const value = scenario(fixtureId, caseId).input.graph
  if (!value) throw new Error(`fixture ${fixtureId}/${caseId} has no graph`)
  return structuredClone(value)
}

describe("P3 Journey projection resolver", () => {
  it("matches the exact PLANNER, EXECUTION, and TRAVELOGUE fixture", () => {
    const fixture = scenario(
      "09-exact-projection-modes",
      "canonical-input-order"
    )
    const input = structuredClone(fixture.input.graph!)

    for (const expected of fixture.expected.projections ?? []) {
      expect(
        resolveJourneyProjection({
          graph: input,
          scopeSectionEventId: expected.scopeSectionEventId,
          mode: expected.mode,
        })
      ).toEqual(expected)
    }
  })

  it("is byte-stable when Event and Link storage order changes", () => {
    const canonical = graph(
      "09-exact-projection-modes",
      "canonical-input-order"
    )
    const shuffled = graph("09-exact-projection-modes", "shuffled-input-order")

    for (const mode of ["PLANNER", "EXECUTION", "TRAVELOGUE"] as const) {
      const expected = resolveJourneyProjection({
        graph: canonical,
        scopeSectionEventId: null,
        mode,
      })
      const actual = resolveJourneyProjection({
        graph: shuffled,
        scopeSectionEventId: null,
        mode,
      })
      expect(JSON.stringify(actual)).toBe(JSON.stringify(expected))
    }
  })

  it("resolves nested current branches and rejects crossing intervals", () => {
    const nested = resolveJourneyProjection({
      graph: graph("06-strict-nested-branch", "two-level-nested-forks"),
      scopeSectionEventId: null,
      mode: "PLANNER",
    })
    expect(nested.events.map((event) => event.eventId)).toEqual([
      "outer-fork",
      "inner-fork",
      "inner-a",
      "inner-join",
      "outer-join",
      "end",
    ])

    expect(() =>
      resolveJourneyProjection({
        graph: graph("06-strict-nested-branch", "crossing-branch-error"),
        scopeSectionEventId: null,
        mode: "PLANNER",
      })
    ).toThrowError(
      expect.objectContaining<Partial<JourneyProjectionError>>({
        code: "CROSSING_BRANCH",
      })
    )
  })

  it("requires one continuous branchKey path with a unique fork and join", () => {
    const keyChanged = graph(
      "05-current-branch-correction",
      "correct-current-selection"
    )
    keyChanged.links.find((link) => link.id === "b-join")!.branchKey = "other"
    expect(() =>
      resolveJourneyProjection({
        graph: keyChanged,
        scopeSectionEventId: null,
        mode: "PLANNER",
      })
    ).toThrowError(
      expect.objectContaining<Partial<JourneyProjectionError>>({
        code: "INVALID_BRANCH_KEY",
      })
    )

    const reusedKey = graph("06-strict-nested-branch", "two-level-nested-forks")
    for (const link of reusedKey.links.filter(
      (candidate) => candidate.kind === "ALTERNATIVE"
    )) {
      link.branchKey = "shared"
    }
    expect(() =>
      resolveJourneyProjection({
        graph: reusedKey,
        scopeSectionEventId: null,
        mode: "PLANNER",
      })
    ).toThrowError(
      expect.objectContaining<Partial<JourneyProjectionError>>({
        code: "INVALID_BRANCH_KEY",
      })
    )

    const mainKey = graph(
      "05-current-branch-correction",
      "correct-current-selection"
    )
    mainKey.links.find((link) => link.id === "fork-a")!.branchKey = "illegal"
    expect(() =>
      resolveJourneyProjection({
        graph: mainKey,
        scopeSectionEventId: null,
        mode: "PLANNER",
      })
    ).toThrow(/MAIN Link fork-a cannot carry branchKey/)
  })

  it("requires an exact revision snapshot for historical projection", () => {
    const fixture = scenario(
      "05-current-branch-correction",
      "correct-current-selection"
    )
    const current = structuredClone(fixture.expected.state!.graph!)
    const revision1 = structuredClone(
      fixture.input.journeyRevisions![0]!.snapshot
    )
    const currentFork = current.events.find((event) => event.id === "fork")!
    currentFork.title = "当前版本的新标题"

    expect(
      resolveJourneyProjection({
        graph: current,
        scopeSectionEventId: null,
        mode: "PLANNER",
      }).events.map((event) => event.eventId)
    ).toEqual(["fork", "branch-b", "join"])

    expect(
      resolveJourneyProjection({
        graph: revision1,
        scopeSectionEventId: null,
        mode: "PLANNER",
        asOfRevision: 1,
      }).events.map((event) => [event.eventId, event.title])
    ).toEqual([
      ["fork", "西湖"],
      ["branch-a", "灵隐寺"],
      ["join", "酒店"],
    ])

    expect(() =>
      resolveJourneyProjection({
        graph: current,
        scopeSectionEventId: null,
        mode: "PLANNER",
        asOfRevision: 1,
      })
    ).toThrowError(
      expect.objectContaining<Partial<JourneyProjectionError>>({
        code: "INVALID_REVISION",
      })
    )
  })

  it("reads the exact Travelogue projection from soft-deleted history", () => {
    const fixture = scenario(
      "12-coordinate-section-delete-history",
      "read-soft-deleted-history"
    )
    const expected = fixture.expected.projections![0]!
    expect(
      resolveJourneyProjection({
        graph: fixture.input.graph!,
        scopeSectionEventId: expected.scopeSectionEventId,
        mode: expected.mode,
      })
    ).toEqual(expected)
  })

  it("derives CITY time with deterministic source fallback", () => {
    const deleted = scenario(
      "12-coordinate-section-delete-history",
      "read-soft-deleted-history"
    )
    for (const expected of deleted.expected.projections!.slice(1)) {
      expect(
        resolveJourneyProjection({
          graph: deleted.input.graph!,
          scopeSectionEventId: expected.scopeSectionEventId,
          mode: expected.mode,
        })
      ).toEqual(expected)
    }

    const mixed = structuredClone(deleted.input.graph!)
    const mixedEnd = mixed.events.find((event) => event.id === "delete-end")!
    if (mixedEnd.type !== "VISIT") throw new Error("fixture invariant")
    delete mixedEnd.actualEndAt
    expect(
      resolveJourneyProjection({
        graph: mixed,
        scopeSectionEventId: null,
        mode: "EXECUTION",
      }).events[0]
    ).toMatchObject({
      startAt: "2026-08-01T01:00:00.000Z",
      endAt: "2026-08-02T00:00:00.000Z",
      valueSource: "PLANNED",
    })
  })

  it("assigns authoritative ordinals to mappable CITY sections", () => {
    const input = graph("01-root-city-and-local-scope", "root-city-chain")
    const cities = input.events.filter(
      (event) => event.type === "SECTION" && event.detail.kind === "CITY"
    )
    for (const [index, city] of cities.entries()) {
      if (city.type !== "SECTION" || city.detail.kind !== "CITY") continue
      city.detail.lat = 30 + index
      city.detail.lng = 120 + index
    }

    const projection = resolveJourneyProjection({
      graph: input,
      scopeSectionEventId: null,
      mode: "PLANNER",
    })

    expect(projection.events).toMatchObject([
      { eventId: "city-a", resolvedPosition: 0, locationOrdinal: 1 },
      {
        eventId: "root-transit",
        resolvedPosition: 1,
        fromLocationOrdinal: 1,
        toLocationOrdinal: 2,
      },
      { eventId: "city-b", resolvedPosition: 2, locationOrdinal: 2 },
    ])
  })

  it("marks EXECUTION time source from selected fields, not lifecycle status", () => {
    const plannedFallback = graph(
      "09-exact-projection-modes",
      "canonical-input-order"
    )
    const fallbackEvent = plannedFallback.events.find(
      (event) => event.id === "confirmed-start"
    )!
    if (fallbackEvent.type !== "VISIT") throw new Error("fixture invariant")
    fallbackEvent.executionStatus = "CONFIRMED"
    delete fallbackEvent.actualStartAt
    delete fallbackEvent.actualEndAt
    expect(
      resolveJourneyProjection({
        graph: plannedFallback,
        scopeSectionEventId: null,
        mode: "EXECUTION",
      }).events[0]
    ).toMatchObject({
      startAt: "2026-08-01T00:00:00.000Z",
      endAt: "2026-08-02T00:00:00.000Z",
      valueSource: "PLANNED",
    })

    const mixed = graph("09-exact-projection-modes", "canonical-input-order")
    const mixedEvent = mixed.events.find(
      (event) => event.id === "confirmed-start"
    )!
    if (mixedEvent.type !== "VISIT") throw new Error("fixture invariant")
    delete mixedEvent.actualEndAt
    expect(
      resolveJourneyProjection({
        graph: mixed,
        scopeSectionEventId: null,
        mode: "EXECUTION",
      }).events[0]
    ).toMatchObject({
      startAt: "2026-08-01T01:00:00.000Z",
      endAt: "2026-08-02T00:00:00.000Z",
      valueSource: "PLANNED",
    })
  })

  it("marks Transit as PLANNED when EXECUTION falls back to planned endpoints", () => {
    const input = graph("09-exact-projection-modes", "canonical-input-order")
    const transit = input.events.find(
      (event) => event.id === "confirmed-transit"
    )
    if (transit?.type !== "TRANSIT") throw new Error("fixture invariant")
    delete transit.detail.actualFromEventId
    delete transit.detail.actualToEventId

    expect(
      resolveJourneyProjection({
        graph: input,
        scopeSectionEventId: null,
        mode: "EXECUTION",
      }).events.find((event) => event.eventId === transit.id)
    ).toMatchObject({
      startAt: "2026-08-01T01:00:00.000Z",
      endAt: "2026-08-02T00:00:00.000Z",
      fromLocationOrdinal: 1,
      toLocationOrdinal: 2,
      valueSource: "PLANNED",
    })
  })

  it("uses actual-to-planned field fallback for exact TRAVELOGUE times", () => {
    const actual = graph("09-exact-projection-modes", "canonical-input-order")
    expect(
      resolveJourneyProjection({
        graph: actual,
        scopeSectionEventId: null,
        mode: "TRAVELOGUE",
      }).events[0]
    ).toMatchObject({
      startAt: "2026-08-01T01:00:00.000Z",
      endAt: "2026-08-01T01:00:00.000Z",
      valueSource: "ACTUAL",
    })

    const planned = structuredClone(actual)
    const plannedEvent = planned.events.find(
      (event) => event.id === "confirmed-start"
    )!
    if (plannedEvent.type !== "VISIT") throw new Error("fixture invariant")
    delete plannedEvent.actualStartAt
    delete plannedEvent.actualEndAt
    expect(
      resolveJourneyProjection({
        graph: planned,
        scopeSectionEventId: null,
        mode: "TRAVELOGUE",
      }).events[0]
    ).toMatchObject({
      startAt: "2026-08-01T00:00:00.000Z",
      endAt: "2026-08-02T00:00:00.000Z",
      valueSource: "PLANNED",
    })

    const mixed = structuredClone(actual)
    const mixedEvent = mixed.events.find(
      (event) => event.id === "confirmed-start"
    )!
    if (mixedEvent.type !== "VISIT") throw new Error("fixture invariant")
    delete mixedEvent.actualEndAt
    expect(
      resolveJourneyProjection({
        graph: mixed,
        scopeSectionEventId: null,
        mode: "TRAVELOGUE",
      }).events[0]
    ).toMatchObject({
      startAt: "2026-08-01T01:00:00.000Z",
      endAt: "2026-08-02T00:00:00.000Z",
      valueSource: "PLANNED",
    })
  })
})
