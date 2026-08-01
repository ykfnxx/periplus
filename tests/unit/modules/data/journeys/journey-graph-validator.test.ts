import { describe, expect, it } from "vitest"
import {
  TARGET_CONTRACT_FIXTURES,
  type TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import {
  JourneyGraphValidationError,
  validateJourneyGraph,
  validateJourneyGraphTransition,
} from "@/modules/data/journeys/journey-graph-validator"

function fixtureGraph(fixtureId: string, caseId: string) {
  const value = TARGET_CONTRACT_FIXTURES.find(
    (item) => item.id === fixtureId
  )?.cases.find((item) => item.id === caseId)?.input.graph
  if (!value) throw new Error(`missing fixture ${fixtureId}/${caseId}`)
  return structuredClone(value)
}

describe("P2A Journey graph validator", () => {
  it("accepts every P0 graph state before P3 branch-resolution checks", () => {
    for (const fixture of TARGET_CONTRACT_FIXTURES) {
      for (const scenario of fixture.cases) {
        for (const candidate of [
          scenario.input.graph,
          scenario.expected.state?.graph,
        ]) {
          if (!candidate) continue
          expect(
            () => validateJourneyGraph(candidate),
            `${fixture.id}/${scenario.id}`
          ).not.toThrow()
        }
      }
    }
  })

  it("accepts P0 nested scopes, unscheduled Events, and stable-identity moves", () => {
    expect(
      validateJourneyGraph(
        fixtureGraph("01-root-city-and-local-scope", "nested-scopes")
      )
    ).toBeDefined()
    expect(
      validateJourneyGraph(
        fixtureGraph("07-unscheduled-placement", "place-inbox-event")
      )
    ).toBeDefined()

    const previous = fixtureGraph(
      "08-replacement-retire-undo",
      "move-keeps-identities"
    )
    const next = structuredClone(
      TARGET_CONTRACT_FIXTURES.find(
        (item) => item.id === "08-replacement-retire-undo"
      )!.cases.find((item) => item.id === "move-keeps-identities")!.expected
        .state!.graph!
    )
    expect(validateJourneyGraphTransition(previous, next)).toEqual(next)
  })

  it("rejects disconnected scopes, active cycles, and invalid Link shapes", () => {
    const disconnected = fixtureGraph(
      "01-root-city-and-local-scope",
      "nested-scopes"
    )
    disconnected.links = disconnected.links.filter(
      (link) => link.id !== "city-a-3"
    )

    const cycle = fixtureGraph("01-root-city-and-local-scope", "nested-scopes")
    cycle.links.push({
      id: "cycle",
      journeyId: cycle.id,
      fromEventId: "meal-a",
      toEventId: "visit-a",
      kind: "ALTERNATIVE",
      branchKey: "cycle",
      rank: 4096,
      introducedRevision: 1,
    })

    const malformed = fixtureGraph(
      "01-root-city-and-local-scope",
      "nested-scopes"
    )
    malformed.links[0]!.branchKey = "not-main"

    for (const invalid of [disconnected, cycle, malformed]) {
      expect(() => validateJourneyGraph(invalid)).toThrow(
        JourneyGraphValidationError
      )
    }
  })

  it("rejects history removal, in-place type mutation, and skipped revisions", () => {
    const previous = fixtureGraph("08-replacement-retire-undo", "retire-event")

    const removed = structuredClone(previous)
    removed.revision = 2
    removed.events = []

    const changedType = structuredClone(previous) as TargetJourneyGraphSnapshot
    changedType.revision = 2
    changedType.events[0] = {
      ...changedType.events[0]!,
      type: "NOTE",
      detail: { body: "changed type" },
    }

    const skipped = structuredClone(previous)
    skipped.revision = 3

    for (const invalid of [removed, changedType, skipped]) {
      expect(() => validateJourneyGraphTransition(previous, invalid)).toThrow(
        JourneyGraphValidationError
      )
    }
  })
})
