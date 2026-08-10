import { describe, expect, it } from "vitest"
import {
  TARGET_CONTRACT_FIXTURES,
  WORKSPACE_WEBSOCKET_TICKET_SECONDS,
  targetCommandBodySchema,
  targetCommandEnvelopeSchema,
  targetCommandResultSchema,
  targetContentBundleSchema,
  targetJourneyBranchSelectionSchema,
  targetJourneyGraphSnapshotSchema,
  targetJourneyRevisionSchema,
  targetResolvedJourneyProjectionSchema,
  targetTransitPlanningRunSchema,
  targetWorkspaceDocumentSchema,
  targetWorkspaceRevisionSchema,
  targetWorkspaceWebSocketTicketClaimsSchema,
  type TargetContractFixture,
  type TargetJourneyGraphSnapshot,
  type TargetScenarioCase,
  type TargetScenarioState,
} from "@/modules/data-model/contracts"

function fixture(id: string): TargetContractFixture {
  const value = TARGET_CONTRACT_FIXTURES.find(
    (candidate) => candidate.id === id
  )
  if (!value) throw new Error(`missing fixture ${id}`)
  return value
}

function scenario(fixtureId: string, caseId: string): TargetScenarioCase {
  const value = fixture(fixtureId).cases.find(
    (candidate) => candidate.id === caseId
  )
  if (!value) throw new Error(`missing scenario ${fixtureId}/${caseId}`)
  return value
}

function expectStateToParse(state: TargetScenarioState, label: string) {
  if (state.graph) {
    expect(
      targetJourneyGraphSnapshotSchema.safeParse(state.graph),
      `${label} graph`
    ).toMatchObject({ success: true })
  }
  if (state.workspace) {
    expect(
      targetWorkspaceDocumentSchema.safeParse(state.workspace),
      `${label} workspace`
    ).toMatchObject({ success: true })
  }
  if (state.content) {
    expect(
      targetContentBundleSchema.safeParse(state.content),
      `${label} content`
    ).toMatchObject({ success: true })
  }
  for (const revision of state.journeyRevisions ?? []) {
    expect(
      targetJourneyRevisionSchema.safeParse(revision),
      `${label} journey revision ${revision.revision}`
    ).toMatchObject({ success: true })
  }
  for (const revision of state.workspaceRevisions ?? []) {
    expect(
      targetWorkspaceRevisionSchema.safeParse(revision),
      `${label} workspace revision ${revision.revision}`
    ).toMatchObject({ success: true })
  }
}

function cloneGraph(value: TargetJourneyGraphSnapshot) {
  return structuredClone(value)
}

describe("breaking data-model target contracts", () => {
  it("parses every table input, command, positive after state, and exact projection", () => {
    for (const item of TARGET_CONTRACT_FIXTURES) {
      for (const entry of item.cases) {
        const label = `${item.id}/${entry.id}`
        expectStateToParse(entry.input, `${label} input`)
        if (entry.command) {
          expect(
            targetCommandEnvelopeSchema.safeParse(entry.command),
            `${label} command`
          ).toMatchObject({ success: true })
        }
        if (entry.expected.state) {
          expectStateToParse(entry.expected.state, `${label} expected`)
        }
        for (const projection of entry.expected.projections ?? []) {
          expect(
            targetResolvedJourneyProjectionSchema.safeParse(projection),
            `${label} projection`
          ).toMatchObject({ success: true })
        }
        if (entry.expected.commandResult) {
          expect(
            targetCommandResultSchema.safeParse(entry.expected.commandResult),
            `${label} command result`
          ).toMatchObject({ success: true })
        }
        if (entry.expected.error) {
          expect(entry.expected.error.code).toMatch(/^[A-Z][A-Z0-9_]+$/)
        }
      }
    }
  })

  it("rejects all five invalid graph states from the independent parse probes", () => {
    const activeLinkToRetiredEvent = cloneGraph(
      scenario("01-root-city-and-local-scope", "root-city-chain").input.graph!
    )
    activeLinkToRetiredEvent.events.find(
      (event) => event.id === "city-a"
    )!.retiredRevision = 1

    const danglingSupersedes = cloneGraph(
      scenario("05-current-branch-correction", "correct-current-selection")
        .expected.state!.graph!
    )
    danglingSupersedes.branchSelections[1]!.supersedesId = "missing-selection"

    const replacementCycle = cloneGraph(
      scenario("08-replacement-retire-undo", "replacement-chain").expected
        .state!.graph!
    )
    replacementCycle.replacements.push({
      id: "replacement-cycle",
      journeyId: replacementCycle.id,
      predecessorEventId: "replacement-c",
      successorEventId: "replacement-a",
      revision: 3,
      reason: "invalid cycle",
    })

    const unknownTransitEndpoint = cloneGraph(
      scenario("01-root-city-and-local-scope", "root-city-chain").input.graph!
    )
    const transit = unknownTransitEndpoint.events.find(
      (event) => event.id === "root-transit"
    )!
    if (transit.type !== "TRANSIT") throw new Error("fixture invariant")
    transit.detail.plannedToEventId = "missing-event"

    const duplicateSelectionId = cloneGraph(
      scenario("05-current-branch-correction", "correct-current-selection")
        .expected.state!.graph!
    )
    duplicateSelectionId.branchSelections.push(
      structuredClone(duplicateSelectionId.branchSelections[1]!)
    )

    for (const invalid of [
      activeLinkToRetiredEvent,
      danglingSupersedes,
      replacementCycle,
      unknownTransitEndpoint,
      duplicateSelectionId,
    ]) {
      expect(targetJourneyGraphSnapshotSchema.safeParse(invalid).success).toBe(
        false
      )
    }
  })

  it("enforces revision bounds and branch supersession causality", () => {
    const introducedAfterHead = cloneGraph(
      scenario("01-root-city-and-local-scope", "root-city-chain").input.graph!
    )
    introducedAfterHead.events[0]!.introducedRevision = 2

    const retiredBeforeIntroduction = cloneGraph(introducedAfterHead)
    retiredBeforeIntroduction.revision = 3
    retiredBeforeIntroduction.events[0]!.introducedRevision = 2
    retiredBeforeIntroduction.events[0]!.retiredRevision = 1

    const sameRevisionSupersession = cloneGraph(
      scenario("05-current-branch-correction", "correct-current-selection")
        .expected.state!.graph!
    )
    sameRevisionSupersession.branchSelections[1]!.journeyRevision = 1

    for (const invalid of [
      introducedAfterHead,
      retiredBeforeIntroduction,
      sameRevisionSupersession,
    ]) {
      expect(targetJourneyGraphSnapshotSchema.safeParse(invalid).success).toBe(
        false
      )
    }
  })

  it("rejects duplicate Content, TransitPlan, and TransitSegment identities", () => {
    const content = structuredClone(
      scenario(
        "11-content-provenance",
        "observation-supersession-and-pinned-content"
      ).input.content!
    )
    content.observations.push(structuredClone(content.observations[0]!))
    expect(targetContentBundleSchema.safeParse(content).success).toBe(false)

    const graphValue = cloneGraph(
      scenario("04-failed-transit-run", "failed-refresh-retains-active-run")
        .expected.state!.graph!
    )
    const readyRun = graphValue.transitPlanningRuns[0]!
    readyRun.plans.push(structuredClone(readyRun.plans[0]!))
    expect(targetJourneyGraphSnapshotSchema.safeParse(graphValue).success).toBe(
      false
    )

    const duplicateSegmentRun = structuredClone(
      scenario("03-transit-plan-choice", "select-low-cost").input.graph!
        .transitPlanningRuns[0]!
    )
    duplicateSegmentRun.plans[1]!.segments[0]!.id =
      duplicateSegmentRun.plans[0]!.segments[0]!.id
    expect(
      targetTransitPlanningRunSchema.safeParse(duplicateSegmentRun).success
    ).toBe(false)
  })

  it("keeps one current branch selection without planned or actual phase", () => {
    const parsed = targetJourneyBranchSelectionSchema.parse({
      id: "selection",
      journeyId: "journey",
      forkEventId: "fork",
      selectedLinkId: "link",
      journeyRevision: 1,
      actor: { kind: "USER", userId: "user" },
      createdAt: "2026-08-01T00:00:00.000Z",
    })
    expect(parsed).not.toHaveProperty("phase")
    expect(
      targetJourneyBranchSelectionSchema.safeParse({
        ...parsed,
        phase: "ACTUAL",
      }).success
    ).toBe(false)
  })

  it("keeps typed command inputs free of persistence-managed fields", () => {
    const parsed = targetCommandEnvelopeSchema.parse({
      aggregateId: "workspace",
      expectedRevision: 0,
      idempotencyKey: "add-visit",
      actor: { kind: "USER", userId: "user" },
      command: {
        name: "journey.add_event",
        payload: {
          event: {
            type: "VISIT",
            title: "西湖",
            detail: {
              plannedLat: 30.25,
              plannedLng: 120.15,
              coordinateSystem: "GCJ02",
            },
          },
          position: { placement: "UNSCHEDULED" },
        },
      },
    })
    if (parsed.command.name !== "journey.add_event") {
      throw new Error("unexpected command")
    }
    expect(parsed.command.payload.event).not.toHaveProperty("journeyId")
    expect(parsed.command.payload.event).not.toHaveProperty(
      "introducedRevision"
    )
    expect(parsed.command.payload.event).not.toHaveProperty("createdAt")
  })

  it("rejects cross-kind update and actual payloads", () => {
    const base = {
      aggregateId: "journey",
      expectedRevision: 1,
      idempotencyKey: "typed-command",
      actor: { kind: "USER", userId: "user" },
    }
    const invalidCommands = [
      {
        ...base,
        command: {
          name: "journey.update_event",
          payload: {
            eventId: "visit",
            patch: {
              type: "VISIT",
              detail: { transportMode: "CAR" },
            },
          },
        },
      },
      {
        ...base,
        command: {
          name: "journey.confirm_actual",
          payload: {
            eventId: "visit",
            actual: {
              type: "VISIT",
              detail: { actualFromEventId: "a" },
            },
          },
        },
      },
      {
        ...base,
        command: {
          name: "journey.add_observation",
          payload: {
            eventId: "visit",
            observation: {
              kind: "RATING",
              phase: "ACTUAL",
              visibility: "JOURNEY",
              value: "five",
            },
          },
        },
      },
      {
        ...base,
        actor: { kind: "SYSTEM", userId: "user" },
        command: {
          name: "journey.skip_event",
          payload: { eventId: "visit" },
        },
      },
    ]
    for (const invalid of invalidCommands) {
      expect(targetCommandEnvelopeSchema.safeParse(invalid).success).toBe(false)
    }
  })

  it("persists UNSCHEDULED events but rejects active links to them", () => {
    const document = cloneGraph(
      scenario("07-unscheduled-placement", "place-inbox-event").input.graph!
    )
    document.links.push({
      id: "invalid-unscheduled-link",
      journeyId: document.id,
      fromEventId: "city",
      toEventId: "inbox-event",
      kind: "MAIN",
      rank: 1024,
      introducedRevision: 1,
    })
    const parsed = targetJourneyGraphSnapshotSchema.safeParse(document)
    expect(parsed.success).toBe(false)
    if (!parsed.success) {
      expect(
        parsed.error.issues.some((issue) =>
          issue.message.includes("UNSCHEDULED")
        )
      ).toBe(true)
    }
  })

  it("retains the READY transit selection when a refresh run fails", () => {
    const entry = scenario(
      "04-failed-transit-run",
      "failed-refresh-retains-active-run"
    )
    const result = entry.expected.state!.graph!
    const transit = result.events.find((event) => event.id === "transit")!
    if (transit.type !== "TRANSIT") throw new Error("fixture invariant")
    expect(transit.detail).toMatchObject({
      activePlanningRunId: "run-ready",
      selectedPlanId: "plan-recommended",
    })
    expect(result.transitPlanningRuns.map((run) => run.status)).toEqual([
      "READY",
      "FAILED",
    ])
    expect(result.transitPlanningRuns[1]).toMatchObject({
      requestFingerprint: "fixture-failed-fingerprint",
      plans: [],
    })
    expect(
      targetTransitPlanningRunSchema.safeParse({
        ...result.transitPlanningRuns[1],
        plans: result.transitPlanningRuns[0]!.plans,
      }).success
    ).toBe(false)
  })

  it("matches canonical graph invariants enforced by database checks", () => {
    const ready = cloneGraph(
      scenario("03-transit-plan-choice", "select-low-cost").input.graph!
    )
    const emptyWithSelection = cloneGraph(ready)
    const emptyTransit = emptyWithSelection.events.find(
      (event) => event.type === "TRANSIT"
    )!
    if (emptyTransit.type !== "TRANSIT") throw new Error("fixture invariant")
    emptyTransit.detail.routeState = "EMPTY"

    const readyWithoutSelection = cloneGraph(ready)
    const unselectedTransit = readyWithoutSelection.events.find(
      (event) => event.type === "TRANSIT"
    )!
    if (unselectedTransit.type !== "TRANSIT") {
      throw new Error("fixture invariant")
    }
    delete unselectedTransit.detail.activePlanningRunId
    delete unselectedTransit.detail.selectedPlanId

    const reversedTime = cloneGraph(ready)
    const reversedEvent = reversedTime.events.find(
      (event) => event.type === "VISIT"
    )!
    if (reversedEvent.type !== "VISIT") throw new Error("fixture invariant")
    reversedEvent.plannedStartAt = "2026-08-02T00:00:00.000Z"
    reversedEvent.plannedEndAt = "2026-08-01T00:00:00.000Z"

    const partialActualCoordinate = cloneGraph(ready)
    const partialCoordinateEvent = partialActualCoordinate.events.find(
      (event) => event.type === "VISIT"
    )!
    if (partialCoordinateEvent.type !== "VISIT") {
      throw new Error("fixture invariant")
    }
    partialCoordinateEvent.detail.actualLat = 30.2

    for (const invalid of [
      emptyWithSelection,
      readyWithoutSelection,
      reversedTime,
      partialActualCoordinate,
    ]) {
      expect(targetJourneyGraphSnapshotSchema.safeParse(invalid).success).toBe(
        false
      )
    }

    for (const type of ["VISIT", "STAY", "MEAL", "ACTIVITY"] as const) {
      expect(
        targetCommandBodySchema.safeParse({
          name: "journey.update_event",
          payload: {
            eventId: "event",
            patch: { type, detail: { actualLat: 30.2 } },
          },
        }).success
      ).toBe(false)
      expect(
        targetCommandBodySchema.safeParse({
          name: "journey.confirm_actual",
          payload: {
            eventId: "event",
            actual: { type, detail: { actualLat: 30.2 } },
          },
        }).success
      ).toBe(false)
    }
    expect(
      targetCommandBodySchema.safeParse({
        name: "journey.update_event",
        payload: {
          eventId: "transit",
          patch: { type: "TRANSIT", detail: { routeState: "READY" } },
        },
      }).success
    ).toBe(false)
    expect(
      targetCommandBodySchema.safeParse({
        name: "journey.add_event",
        payload: {
          event: {
            type: "NOTE",
            title: "note",
            detail: { body: "   " },
          },
          position: { placement: "UNSCHEDULED" },
        },
      }).success
    ).toBe(false)

    const readyRun = structuredClone(ready.transitPlanningRuns[0]!)
    const invalidRunValidity = structuredClone(readyRun)
    invalidRunValidity.validUntil = "2025-08-01T00:00:00.000Z"
    const invalidPlanValidity = structuredClone(readyRun)
    invalidPlanValidity.plans[0]!.validUntil = "2025-08-01T00:00:00.000Z"
    const invalidSegmentTime = structuredClone(readyRun)
    invalidSegmentTime.plans[0]!.segments[0]!.departAt =
      "2026-08-02T00:00:00.000Z"
    invalidSegmentTime.plans[0]!.segments[0]!.arriveAt =
      "2026-08-01T00:00:00.000Z"
    const failedWithoutError = structuredClone(readyRun)
    failedWithoutError.status = "FAILED"
    failedWithoutError.plans = []
    for (const invalid of [
      invalidRunValidity,
      invalidPlanValidity,
      invalidSegmentTime,
      failedWithoutError,
    ]) {
      expect(targetTransitPlanningRunSchema.safeParse(invalid).success).toBe(
        false
      )
    }

    const content = structuredClone(
      scenario(
        "11-content-provenance",
        "observation-supersession-and-pinned-content"
      ).input.content!
    )
    content.eventSourceLinks[0]!.approvedForJourneySharing = true
    content.eventSourceLinks[0]!.excerpt = "   "
    expect(targetContentBundleSchema.safeParse(content).success).toBe(false)
  })

  it("keeps provenance and execution facts under dedicated command authority", () => {
    const baseEvent = {
      type: "VISIT" as const,
      title: "visit",
      detail: {
        plannedLat: 30.2,
        plannedLng: 120.1,
        coordinateSystem: "GCJ02" as const,
      },
    }
    for (const origin of [
      "ORIGINAL",
      "USER_INSERTED",
      "AGENT_INSERTED",
      "FORKED",
      "SOURCE_DERIVED",
    ] as const) {
      expect(
        targetCommandBodySchema.safeParse({
          name: "journey.add_event",
          payload: {
            event: { ...baseEvent, origin },
            position: { placement: "UNSCHEDULED" },
          },
        }).success
      ).toBe(false)
    }
    for (const forbidden of [
      { executionStatus: "CONFIRMED" },
      { actualStartAt: "2026-08-01T00:00:00.000Z" },
    ]) {
      expect(
        targetCommandBodySchema.safeParse({
          name: "journey.add_event",
          payload: {
            event: { ...baseEvent, ...forbidden },
            position: { placement: "UNSCHEDULED" },
          },
        }).success
      ).toBe(false)
    }
    for (const patch of [
      { type: "VISIT", executionStatus: "SKIPPED" },
      {
        type: "VISIT",
        actualStartAt: "2026-08-01T00:00:00.000Z",
      },
      { type: "VISIT", detail: { actualLat: 30.2, actualLng: 120.1 } },
    ]) {
      expect(
        targetCommandBodySchema.safeParse({
          name: "journey.update_event",
          payload: { eventId: "event", patch },
        }).success
      ).toBe(false)
    }
    for (const name of [
      "journey.confirm_actual",
      "journey.skip_event",
      "journey.cancel_event",
    ] as const) {
      const payload =
        name === "journey.confirm_actual"
          ? { eventId: "event", actual: { type: "VISIT", detail: {} } }
          : { eventId: "event" }
      expect(targetCommandBodySchema.safeParse({ name, payload }).success).toBe(
        true
      )
    }
  })

  it("requires a parent revision after current branch correction", () => {
    const state = scenario(
      "05-current-branch-correction",
      "correct-current-selection"
    ).expected.state!
    const missingParent = structuredClone(state.journeyRevisions?.[1])
    if (!missingParent) throw new Error("fixture invariant")
    delete missingParent.parentRevisionId
    expect(targetJourneyRevisionSchema.safeParse(missingParent).success).toBe(
      false
    )
  })

  it("mirrors database natural and partial unique constraints in graph contracts", () => {
    const transit = cloneGraph(
      scenario("03-transit-plan-choice", "select-low-cost").input.graph!
    )
    const run = transit.transitPlanningRuns[0]!
    const duplicateRankPlan = structuredClone(run.plans[0]!)
    duplicateRankPlan.id = "duplicate-plan-rank"
    for (const segment of duplicateRankPlan.segments) {
      segment.id = `${segment.id}-duplicate-rank`
    }
    run.plans.push(duplicateRankPlan)
    expect(targetTransitPlanningRunSchema.safeParse(run).success).toBe(false)
    expect(targetJourneyGraphSnapshotSchema.safeParse(transit).success).toBe(
      false
    )

    const topology = cloneGraph(
      scenario("05-current-branch-correction", "correct-current-selection")
        .input.graph!
    )
    topology.links.push({
      ...structuredClone(topology.links[0]!),
      id: "duplicate-link-natural-key",
    })
    expect(targetJourneyGraphSnapshotSchema.safeParse(topology).success).toBe(
      false
    )

    const content = cloneGraph(
      scenario(
        "11-content-provenance",
        "observation-supersession-and-pinned-content"
      ).expected.state!.graph!
    )
    const duplicateAssetRank = cloneGraph(content)
    duplicateAssetRank.eventAssetLinks.push({
      ...structuredClone(duplicateAssetRank.eventAssetLinks[0]!),
      id: "duplicate-active-asset-rank",
      assetId: "another-asset",
      assetChecksum: "another-asset-checksum",
    })
    expect(
      targetJourneyGraphSnapshotSchema.safeParse(duplicateAssetRank).success
    ).toBe(false)

    const duplicateSourceRank = cloneGraph(content)
    duplicateSourceRank.eventSourceLinks.push({
      ...structuredClone(duplicateSourceRank.eventSourceLinks[0]!),
      id: "duplicate-active-source-rank",
      sourceItemId: "another-source-item",
    })
    expect(
      targetJourneyGraphSnapshotSchema.safeParse(duplicateSourceRank).success
    ).toBe(false)
  })

  it("requires Observation supersession to be a single same-domain chain", () => {
    const source = structuredClone(
      scenario(
        "11-content-provenance",
        "observation-supersession-and-pinned-content"
      ).expected.state!.graph!
    )

    const branched = structuredClone(source)
    branched.observations.push({
      ...structuredClone(branched.observations[1]!),
      id: "observation-branch",
      supersedesId: "observation-1",
      createdAt: "2026-08-01T02:00:00.000Z",
    })

    const cycle = structuredClone(source)
    cycle.observations[0]!.supersedesId = "observation-2"

    const crossEvent = structuredClone(source)
    crossEvent.events.push({
      ...structuredClone(crossEvent.events[0]!),
      id: "content-event-other",
      placementStatus: "UNSCHEDULED",
      parentSectionEventId: null,
    })
    crossEvent.observations[1]!.eventId = "content-event-other"

    const crossKind = structuredClone(source)
    ;(crossKind.observations[1] as { kind: string }).kind = "FACT"

    const crossPhase = structuredClone(source)
    crossPhase.observations[1]!.phase = "PLANNED"

    for (const invalid of [
      branched,
      cycle,
      crossEvent,
      crossKind,
      crossPhase,
    ]) {
      expect(targetJourneyGraphSnapshotSchema.safeParse(invalid).success).toBe(
        false
      )
    }
  })

  it("does not let an EventAssetLink broaden Asset visibility", () => {
    const bundle = structuredClone(
      scenario(
        "11-content-provenance",
        "observation-supersession-and-pinned-content"
      ).input.content!
    )
    bundle.eventAssetLinks[0]!.visibility = "PUBLIC"
    expect(targetContentBundleSchema.safeParse(bundle).success).toBe(false)

    const staleAssetReference = structuredClone(
      scenario(
        "11-content-provenance",
        "observation-supersession-and-pinned-content"
      ).input.content!
    )
    staleAssetReference.eventAssetLinks[0]!.assetChecksum = "stale-checksum"
    expect(
      targetContentBundleSchema.safeParse(staleAssetReference).success
    ).toBe(false)

    const staleSourceReference = structuredClone(
      scenario(
        "11-content-provenance",
        "observation-supersession-and-pinned-content"
      ).input.content!
    )
    staleSourceReference.eventSourceLinks[0]!.sourceDocumentChecksum =
      "stale-checksum"
    expect(
      targetContentBundleSchema.safeParse(staleSourceReference).success
    ).toBe(false)
  })

  it("freezes scoped WebSocket ticket lifetimes independently of Workspace history", () => {
    expect(WORKSPACE_WEBSOCKET_TICKET_SECONDS).toBe(300)
    const claims = {
      subjectUserId: "user",
      workspaceId: "workspace",
      issuedAt: 1_000,
      expiresAt: 1_300,
      nonce: "nonce",
    }
    expect(
      targetWorkspaceWebSocketTicketClaimsSchema.safeParse(claims).success
    ).toBe(true)
    expect(
      targetWorkspaceWebSocketTicketClaimsSchema.safeParse({
        ...claims,
        expiresAt: claims.issuedAt,
      }).success
    ).toBe(false)
    expect(
      targetWorkspaceWebSocketTicketClaimsSchema.safeParse({
        ...claims,
        expiresAt: claims.issuedAt + WORKSPACE_WEBSOCKET_TICKET_SECONDS + 1,
      }).success
    ).toBe(false)
  })

})
