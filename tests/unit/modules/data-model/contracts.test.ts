import { describe, expect, it } from "vitest"
import {
  TARGET_CONTRACT_FIXTURES,
  TARGET_DELETION_MATRIX,
  TARGET_FIELD_AUTHORITY,
  TARGET_IDEMPOTENCY_POLICY,
  TARGET_MODEL_RELATIONS,
  WORKSPACE_ACTIVE_LEASE_DAYS,
  WORKSPACE_WEBSOCKET_TICKET_SECONDS,
  targetCommandEnvelopeSchema,
  targetContentBundleSchema,
  targetJourneyBranchSelectionSchema,
  targetJourneyGraphSnapshotSchema,
  targetResolvedJourneyProjectionSchema,
  targetTransitPlanningRunSchema,
  targetWorkspaceDocumentSchema,
} from "@/modules/data-model/contracts"

function fixture(id: string) {
  const value = TARGET_CONTRACT_FIXTURES.find(
    (candidate) => candidate.id === id
  )
  if (!value) throw new Error(`missing fixture ${id}`)
  return value
}

describe("breaking data-model target contracts", () => {
  it("freezes twelve uniquely named cross-layer fixtures", () => {
    expect(TARGET_CONTRACT_FIXTURES).toHaveLength(12)
    expect(new Set(TARGET_CONTRACT_FIXTURES.map((item) => item.id)).size).toBe(
      12
    )
  })

  it("parses every graph, workspace, content, command, and projection fixture", () => {
    for (const item of TARGET_CONTRACT_FIXTURES) {
      if (item.graph) {
        expect(
          targetJourneyGraphSnapshotSchema.safeParse(item.graph),
          `${item.id} graph`
        ).toMatchObject({ success: true })
      }
      if (item.invalidGraph) {
        expect(
          targetJourneyGraphSnapshotSchema.safeParse(item.invalidGraph),
          `${item.id} invalid graph contract shape`
        ).toMatchObject({ success: true })
        expect(item.expectedValidationError).toBeTruthy()
      }
      if (item.workspace) {
        expect(
          targetWorkspaceDocumentSchema.safeParse(item.workspace),
          `${item.id} workspace`
        ).toMatchObject({ success: true })
      }
      if (item.content) {
        expect(
          targetContentBundleSchema.safeParse(item.content),
          `${item.id} content`
        ).toMatchObject({ success: true })
      }
      for (const command of item.commands ?? []) {
        expect(
          targetCommandEnvelopeSchema.safeParse(command),
          `${item.id} command`
        ).toMatchObject({ success: true })
      }
      for (const projection of item.expectedProjections ?? []) {
        expect(
          targetResolvedJourneyProjectionSchema.safeParse(projection),
          `${item.id} projection`
        ).toMatchObject({ success: true })
      }
    }
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
    expect(fixture("05-current-branch-correction").expectedHistory).toEqual({
      revision1Selection: "fork-a",
      revision2Selection: "fork-b",
    })
  })

  it("keeps command inputs free of persistence-managed fields", () => {
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

  it("persists UNSCHEDULED events but rejects active links to them", () => {
    const document = structuredClone(fixture("07-unscheduled-placement").graph!)
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
      expect(parsed.error.issues[0]?.message).toContain("UNSCHEDULED")
    }
  })

  it("keeps DAY date as input while SECTION time remains derived", () => {
    const document = structuredClone(
      fixture("02-city-day-event-drilldown").graph!
    )
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

  it("records failed transit runs without plans", () => {
    expect(
      fixture("04-failed-transit-run").graph?.transitPlanningRuns[0]
    ).toMatchObject({
      status: "FAILED",
      requestFingerprint: "fixture-failed-fingerprint",
      errorCode: "PROVIDER_TIMEOUT",
      plans: [],
    })
    expect(
      targetTransitPlanningRunSchema.safeParse({
        id: "run",
        transitEventId: "transit",
        requestFingerprint: "fingerprint",
        provider: "mock",
        status: "FAILED",
        calculatedAt: "2026-08-01T00:00:00.000Z",
        plans: [
          {
            id: "unexpected-plan",
            planningRunId: "run",
            transitEventId: "transit",
            provider: "mock",
            rank: 0,
            label: "unexpected",
            strategy: "unexpected",
            distanceMeters: 0,
            durationSeconds: 0,
            trafficBasis: "UNKNOWN",
            calculatedAt: "2026-08-01T00:00:00.000Z",
            segments: [],
          },
        ],
      }).success
    ).toBe(false)
  })

  it("does not let an EventAssetLink broaden Asset visibility", () => {
    const bundle = structuredClone(fixture("11-content-provenance").content!)
    bundle.eventAssetLinks[0]!.visibility = "PUBLIC"
    expect(targetContentBundleSchema.safeParse(bundle).success).toBe(false)
  })

  it("freezes workspace lease and scoped WebSocket ticket lifetimes", () => {
    expect(WORKSPACE_ACTIVE_LEASE_DAYS).toBe(30)
    expect(WORKSPACE_WEBSOCKET_TICKET_SECONDS).toBe(300)
  })

  it("assigns each field one authority and covers current, target, and derived", () => {
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

  it("publishes a machine-readable target ERD for the schema baseline", () => {
    expect(TARGET_MODEL_RELATIONS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "JourneyRevision",
          to: "Journey",
          foreignKey: "journeyId",
        }),
        expect.objectContaining({
          from: "WorkspaceRevision",
          to: "WorkspaceSession",
          foreignKey: "workspaceId",
        }),
        expect.objectContaining({
          from: "EventSourceLink",
          to: "SourceItem",
          foreignKey: "sourceItemId",
        }),
      ])
    )
    expect(
      new Set(TARGET_MODEL_RELATIONS.map((relation) => relation.from)).size
    ).toBeGreaterThan(20)
  })

  it("pins exact projection facts for all three modes", () => {
    const projections = fixture(
      "09-exact-projection-modes"
    ).expectedProjections!
    expect(projections.map((projection) => projection.mode)).toEqual([
      "PLANNER",
      "EXECUTION",
      "TRAVELOGUE",
    ])
    expect(projections[2]?.events.map((event) => event.eventId)).toEqual([
      "confirmed",
    ])
    expect(projections[1]?.events.map((event) => event.valueSource)).toEqual([
      "ACTUAL",
      "PLANNED",
      "PLANNED",
    ])
  })
})
