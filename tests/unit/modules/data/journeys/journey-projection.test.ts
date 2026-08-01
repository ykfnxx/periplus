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
})
