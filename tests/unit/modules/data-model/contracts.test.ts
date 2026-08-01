import { describe, expect, it } from "vitest"
import {
  TARGET_CONTRACT_FIXTURES,
  TARGET_DELETION_MATRIX,
  TARGET_FIELD_AUTHORITY,
  TARGET_IDEMPOTENCY_POLICY,
  TARGET_MANDATORY_RELATION_IDS,
  TARGET_MODEL_RELATIONS,
  WORKSPACE_ACTIVE_LEASE_DAYS,
  WORKSPACE_WEBSOCKET_TICKET_SECONDS,
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
  it("freezes twelve uniquely named table-driven fixtures", () => {
    expect(TARGET_CONTRACT_FIXTURES).toHaveLength(12)
    expect(new Set(TARGET_CONTRACT_FIXTURES.map((item) => item.id)).size).toBe(
      12
    )
    for (const item of TARGET_CONTRACT_FIXTURES) {
      expect(item.cases.length, item.id).toBeGreaterThan(0)
      expect(new Set(item.cases.map((entry) => entry.id)).size).toBe(
        item.cases.length
      )
      for (const entry of item.cases) {
        expect(entry.expected).toBeDefined()
        expect(
          entry.expected.state !== undefined ||
            entry.expected.projections !== undefined ||
            entry.expected.commandResult !== undefined ||
            entry.expected.error !== undefined,
          `${item.id}/${entry.id} must have an executable expectation`
        ).toBe(true)
      }
    }
  })

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

  it("makes every second-gate fixture row executable", () => {
    const nestedScope = scenario(
      "01-root-city-and-local-scope",
      "nested-scopes"
    ).input.graph!
    expect(
      nestedScope.events.some(
        (event) =>
          event.type === "MEAL" && event.parentSectionEventId === "city-a"
      )
    ).toBe(true)

    const projectionInput = scenario(
      "09-exact-projection-modes",
      "canonical-input-order"
    ).input.graph!
    expect(
      projectionInput.events.flatMap((event) =>
        "executionStatus" in event ? [event.executionStatus] : []
      )
    ).toEqual(expect.arrayContaining(["SKIPPED", "CANCELLED"]))

    const refresh = scenario("10-workspace-lifecycle", "refresh-after-reauth")
    expect(refresh.command?.command).toMatchObject({
      name: "workspace.refresh",
      payload: { fromWorkspaceRevision: 1 },
    })

    const observation = scenario(
      "11-content-provenance",
      "supersede-observation-command"
    )
    expect(observation.command?.command).toMatchObject({
      name: "journey.add_observation",
      payload: {
        observation: { supersedesId: "observation-1" },
      },
    })

    const deleted = scenario(
      "12-coordinate-section-delete-history",
      "read-soft-deleted-history"
    ).input.graph!
    const segments = deleted.transitPlanningRuns.flatMap((run) =>
      run.plans.flatMap((plan) => plan.segments)
    )
    expect(segments.length).toBeGreaterThan(0)
    expect(
      segments.every((segment) => segment.coordinateSystem === "WGS84")
    ).toBe(true)
  })

  it("rejects all five invalid graph states from the independent parse probes", () => {
    const activeLinkToRetiredEvent = cloneGraph(
      scenario("01-root-city-and-local-scope", "nested-scopes").input.graph!
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
      scenario("01-root-city-and-local-scope", "nested-scopes").input.graph!
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
      scenario("01-root-city-and-local-scope", "nested-scopes").input.graph!
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
      fromEventId: "day",
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

  it("keeps DAY date as input while SECTION time remains derived", () => {
    const document = scenario(
      "02-city-day-event-drilldown",
      "city-day-drilldown"
    ).input.graph!
    const day = document.events.find((event) => event.id === "day")!
    expect(day.type).toBe("SECTION")
    if (day.type !== "SECTION" || day.detail.kind !== "DAY") return
    expect(day.detail).toMatchObject({
      localDate: "2026-08-01",
      timezone: "Asia/Shanghai",
    })
    expect(day).not.toHaveProperty("plannedStartAt")
    expect(day).not.toHaveProperty("actualStartAt")
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

  it("preserves old branch selection snapshots after current correction", () => {
    const state = scenario(
      "05-current-branch-correction",
      "correct-current-selection"
    ).expected.state!
    expect(state.journeyRevisions).toHaveLength(2)
    expect(
      state.journeyRevisions?.[0]?.snapshot.branchSelections.map(
        (selection) => selection.selectedLinkId
      )
    ).toEqual(["fork-a"])
    expect(
      state.journeyRevisions?.[1]?.snapshot.branchSelections.find(
        (selection) => selection.id === "selection-b"
      )?.selectedLinkId
    ).toBe("fork-b")
    const missingParent = structuredClone(state.journeyRevisions?.[1])
    if (!missingParent) throw new Error("fixture invariant")
    delete missingParent.parentRevisionId
    expect(targetJourneyRevisionSchema.safeParse(missingParent).success).toBe(
      false
    )
  })

  it("contains two real nested forks in the positive branch fixture", () => {
    const graphValue = scenario(
      "06-strict-nested-branch",
      "two-level-nested-forks"
    ).input.graph!
    expect(
      graphValue.branchSelections.map((selection) => selection.forkEventId)
    ).toEqual(["outer-fork", "inner-fork"])
    expect(
      scenario("06-strict-nested-branch", "crossing-branch-error").expected
        .error?.code
    ).toBe("CROSSING_BRANCH")
  })

  it("pins exact move, replacement chain, retire, and append-only undo states", () => {
    const item = fixture("08-replacement-retire-undo")
    expect(item.cases.map((entry) => entry.id)).toEqual([
      "move-keeps-identities",
      "replacement-chain",
      "retire-event",
      "undo-appends-revision",
    ])
    const move = scenario("08-replacement-retire-undo", "move-keeps-identities")
    expect(move.input.graph!.events.map((event) => event.id)).toEqual(
      move.expected.state!.graph!.events.map((event) => event.id)
    )
    expect(move.input.graph!.links.map((item) => item.id)).toEqual(
      move.expected.state!.graph!.links.map((item) => item.id)
    )
    const replacement = scenario(
      "08-replacement-retire-undo",
      "replacement-chain"
    ).expected.state!.graph!
    expect(replacement.replacements).toHaveLength(2)
    const undo = scenario("08-replacement-retire-undo", "undo-appends-revision")
      .expected.state!
    expect(undo.graph!.revision).toBe(3)
    expect(undo.graph!.events[0]!.retiredRevision).toBeUndefined()
    expect(undo.journeyRevisions?.map((revision) => revision.revision)).toEqual(
      [1, 2, 3]
    )
  })

  it("covers every required workspace lifecycle outcome", () => {
    const item = fixture("10-workspace-lifecycle")
    expect(item.cases.map((entry) => entry.id)).toEqual([
      "owner-dirty",
      "no-access",
      "expired",
      "stale",
      "conflict",
      "refresh-after-reauth",
      "fork-workspace",
      "idempotent-replay",
      "restart-recovery",
    ])
    expect(
      scenario("10-workspace-lifecycle", "idempotent-replay").expected
        .commandResult
    ).toMatchObject({ replayedFromIdempotencyKey: true })
    const restart = scenario("10-workspace-lifecycle", "restart-recovery")
    expect(JSON.stringify(restart.input)).toBe(
      JSON.stringify(restart.expected.state)
    )
  })

  it("pins content display metadata and Observation supersession in snapshots", () => {
    const state = scenario(
      "11-content-provenance",
      "observation-supersession-and-pinned-content"
    ).expected.state!
    const snapshot = state.journeyRevisions?.[1]?.snapshot
    expect(snapshot?.eventAssetLinks[0]).toMatchObject({
      caption: "清晨西湖",
      role: "GALLERY",
      rank: 1024,
      visibility: "PRIVATE",
      assetId: "asset-private",
      assetChecksum: "asset-checksum",
    })
    expect(snapshot?.observations[1]).toMatchObject({
      id: "observation-2",
      supersedesId: "observation-1",
      body: "清晨人少",
    })
    expect(snapshot?.eventSourceLinks[0]).toMatchObject({
      sourceDocumentId: "source-document",
      sourceDocumentChecksum: "document-checksum",
      excerpt: "西湖旧称武林水。",
      page: "12",
      confidence: 0.98,
      rank: 1024,
    })
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

  it("retains WGS84 SECTION-derived history after Journey soft delete", () => {
    const entry = scenario(
      "12-coordinate-section-delete-history",
      "read-soft-deleted-history"
    )
    expect(entry.input.graph?.deletedAt).toBeDefined()
    expect(entry.input.journeyRevisions?.map((item) => item.revision)).toEqual([
      1, 2,
    ])
    expect(entry.input.journeyRevisions?.[1]?.snapshot.deletedAt).toBeDefined()
    expect(entry.expected.evidence).toMatchObject({
      sectionEventId: "day",
      coordinateSystem: "WGS84",
      derivedStartAt: "2026-08-01T01:00:00.000Z",
      derivedEndAt: "2026-08-02T00:00:00.000Z",
    })
  })

  it("freezes workspace lease and scoped WebSocket ticket lifetimes", () => {
    expect(WORKSPACE_ACTIVE_LEASE_DAYS).toBe(30)
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

  it("assigns each field one authority and covers all authority classes", () => {
    const fields = TARGET_FIELD_AUTHORITY.map((rule) => rule.field)
    expect(new Set(fields).size).toBe(fields.length)
    expect(
      new Set(TARGET_FIELD_AUTHORITY.map((rule) => rule.authority))
    ).toEqual(new Set(["CURRENT", "TARGET", "DERIVED"]))
  })

  it("freezes deletion and idempotency policies", () => {
    expect(TARGET_DELETION_MATRIX).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "Journey",
          dependent: "JourneyRevision",
          ordinaryDelete: "PRESERVE",
        }),
        expect.objectContaining({
          owner: "JourneyEvent",
          dependent: "Asset",
          ordinaryDelete: "PRESERVE",
        }),
      ])
    )
    expect(TARGET_IDEMPOTENCY_POLICY).toEqual({
      scope: "aggregate",
      sameKeySamePayload: "RETURN_ORIGINAL_RESULT",
      sameKeyDifferentPayload: "CONFLICT",
    })
  })

  it("publishes an unambiguous physical-relation ERD for P1", () => {
    const relationIds = TARGET_MODEL_RELATIONS.map((item) => item.id)
    expect(new Set(relationIds).size).toBe(TARGET_MODEL_RELATIONS.length)
    expect(new Set(relationIds)).toEqual(new Set(TARGET_MANDATORY_RELATION_IDS))
    for (const item of TARGET_MODEL_RELATIONS) {
      expect(item.fromFields.length, item.id).toBeGreaterThan(0)
      expect(item.fromFields.length, item.id).toBe(item.toFields.length)
      expect(item.fromFields.some((field) => field.includes("/"))).toBe(false)
      expect(item.toFields.some((field) => field.includes("/"))).toBe(false)
      expect(item.relationName.length).toBeGreaterThan(0)
      if (item.unique) expect(item.cardinality, item.id).toBe("1:1")
    }
    expect(TARGET_MODEL_RELATIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "journey-link-from-event",
          fromFields: ["journeyId", "fromEventId"],
          toFields: ["journeyId", "id"],
          relationName: "OutgoingJourneyLinks",
        }),
        expect.objectContaining({
          id: "journey-link-to-event",
          fromFields: ["journeyId", "toEventId"],
          toFields: ["journeyId", "id"],
          relationName: "IncomingJourneyLinks",
        }),
        expect.objectContaining({
          id: "branch-selection-supersedes",
          optional: true,
          unique: true,
        }),
        expect.objectContaining({
          id: "transit-detail-active-run",
          fromFields: ["eventId", "activePlanningRunId"],
          toFields: ["transitEventId", "id"],
        }),
        expect.objectContaining({
          id: "transit-detail-selected-plan",
          fromFields: ["eventId", "activePlanningRunId", "selectedPlanId"],
          toFields: ["transitEventId", "planningRunId", "id"],
        }),
        expect.objectContaining({
          id: "workspace-base-revision",
          fromFields: ["sourceJourneyId", "baseJourneyRevision"],
          toFields: ["journeyId", "revision"],
        }),
        expect.objectContaining({
          id: "journey-revision-workspace-revision",
          unique: true,
        }),
        expect.objectContaining({
          id: "section-detail-place",
          fromFields: ["placeId"],
          toModel: "Place",
        }),
        expect.objectContaining({
          id: "meal-detail-planned-place",
          fromFields: ["plannedPlaceId"],
          toModel: "Place",
        }),
        expect.objectContaining({
          id: "place-provider-match-place",
          fromModel: "PlaceProviderMatch",
          toModel: "Place",
        }),
        expect.objectContaining({
          id: "provider-usage-agent-run",
          fromModel: "ProviderUsageLog",
          optional: true,
        }),
        expect.objectContaining({
          id: "replacement-revision",
          fromFields: ["journeyId", "revision"],
          toFields: ["journeyId", "revision"],
        }),
        expect.objectContaining({
          id: "journey-event-retired-revision",
          optional: true,
        }),
      ])
    )
  })

  it("pins exact projection bytes and Transit location ordinals", () => {
    const canonical = scenario(
      "09-exact-projection-modes",
      "canonical-input-order"
    ).expected.projections!
    const shuffled = scenario(
      "09-exact-projection-modes",
      "shuffled-input-order"
    ).expected.projections!
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(canonical))
    expect(canonical.map((projection) => projection.mode)).toEqual([
      "PLANNER",
      "EXECUTION",
      "TRAVELOGUE",
    ])
    for (const projection of canonical) {
      const transit = projection.events.find(
        (event) => event.eventId === "confirmed-transit"
      )
      expect(transit).toMatchObject({
        fromLocationOrdinal: 1,
        toLocationOrdinal: 2,
      })
      expect(transit).not.toHaveProperty("locationOrdinal")
    }
    expect(canonical[2]!.events.map((event) => event.eventId)).toEqual([
      "confirmed-start",
      "confirmed-transit",
      "confirmed-end",
    ])
  })
})
