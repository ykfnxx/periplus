import { describe, expect, it } from "vitest"
import {
  capabilityReport,
  evalCapabilityReportSchema,
  evalContentHash,
  MemoryEvalTraceSink,
  validatePlaceCapability,
  validateTransitCapability,
  validateWriteProtocolCapability,
  verifyEvalTrace,
} from "@/backend/agent/evals"
import {
  buildTransitPlanRequest,
  transitPlanFingerprint,
} from "@/lib/journeys/planning"
import type { PlaceResolveResult, PlaceSearchResult } from "@/lib/places/types"
import {
  TARGET_CONTRACT_FIXTURES,
  type TargetJourneyEvent,
  type TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"

const commandHash = "0".repeat(64)

function westLake(): PlaceSearchResult {
  const coordinate = {
    provider: "amap" as const,
    coordinateSystem: "GCJ02" as const,
    lat: 30.2501,
    lng: 120.1501,
    accuracy: "provider_poi" as const,
    source: "provider_search" as const,
  }
  return {
    id: "amap-west-lake",
    name: "西湖风景名胜区",
    normalizedName: "西湖风景名胜区",
    aliases: ["西湖"],
    category: "SIGHT",
    city: "杭州市",
    coordinates: [coordinate],
    bestCoordinate: coordinate,
    sources: [{ provider: "amap", providerId: "B-west-lake" }],
    confidence: 0.96,
    quality: "verified",
    canAddToJourney: true,
    needsUserConfirmation: false,
    reason: "provider exact match",
  }
}

async function recordedPlaceEvidence(
  result: unknown,
  evidenceId: string,
  resultStatus: string
) {
  const sink = new MemoryEvalTraceSink()
  await sink.emit({
    runId: "place-run",
    scenarioId: "place-scenario",
    type: "run.started",
    spanId: "run-span",
    status: "OK",
    payload: {},
  })
  await sink.emit({
    runId: "place-run",
    scenarioId: "place-scenario",
    type: "tool.started",
    spanId: "place-tool-span",
    parentSpanId: "run-span",
    status: "OK",
    payload: { toolType: "place.resolve" },
  })
  await sink.emit({
    runId: "place-run",
    scenarioId: "place-scenario",
    type: "evidence.recorded",
    spanId: "evidence-span",
    parentSpanId: "place-tool-span",
    status: "OK",
    payload: {
      evidenceId,
      toolType: "place.resolve",
      contentHash: evalContentHash(result),
      resultStatus,
    },
  })
  await sink.emit({
    runId: "place-run",
    scenarioId: "place-scenario",
    type: "tool.completed",
    spanId: "place-tool-span",
    parentSpanId: "run-span",
    status: "OK",
    payload: { toolType: "place.resolve" },
  })
  await sink.emit({
    runId: "place-run",
    scenarioId: "place-scenario",
    type: "run.completed",
    spanId: "run-span",
    status: "OK",
    payload: {},
  })
  return sink.events
}

function alignTransitFixtureDestination(graph: TargetJourneyGraphSnapshot) {
  const destination = graph.events.find((event) => event.id === "end")
  if (destination?.type !== "VISIT") throw new Error("fixture invariant")
  destination.detail.plannedLat = 30.35
  destination.detail.plannedLng = 120.25
}

async function emitWriteCommand(
  sink: MemoryEvalTraceSink,
  input: {
    spanId: string
    commandId: string
    revisionBefore: number
    revisionAfter: number
    replayed: boolean
    idempotencyKey?: string
    commandHashSeed?: string
  }
) {
  const commandName = "journey.update_event"
  const idempotencyKey = input.idempotencyKey ?? input.commandId
  const commandHash = evalContentHash({
    commandName,
    idempotencyKey,
    seed: input.commandHashSeed,
  })
  await sink.emit({
    runId: "write-run",
    scenarioId: "write-scenario",
    type: "command.dispatched",
    spanId: input.spanId,
    parentSpanId: "run-span",
    workspaceId: "workspace-1",
    commandId: input.commandId,
    revisionBefore: input.revisionBefore,
    status: "OK",
    payload: {
      commandName,
      idempotencyKey,
      commandHash,
    },
  })
  if (!input.replayed) {
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "state.diff.recorded",
      spanId: input.spanId,
      parentSpanId: "run-span",
      workspaceId: "workspace-1",
      commandId: input.commandId,
      revisionBefore: input.revisionBefore,
      revisionAfter: input.revisionAfter,
      status: "OK",
      payload: {
        changedEventIds: ["event-1"],
        projectionInvalidationScopes: ["journey"],
      },
    })
  }
  await sink.emit({
    runId: "write-run",
    scenarioId: "write-scenario",
    type: "command.applied",
    spanId: input.spanId,
    parentSpanId: "run-span",
    workspaceId: "workspace-1",
    commandId: input.commandId,
    revisionBefore: input.revisionBefore,
    revisionAfter: input.revisionAfter,
    status: "OK",
    payload: {
      commandName,
      replayedFromIdempotencyKey: input.replayed,
    },
  })
}

async function emitRejectedWriteCommand(
  sink: MemoryEvalTraceSink,
  input: {
    spanId: string
    commandId: string
    revisionBefore: number
    idempotencyKey?: string
    commandHashSeed?: string
  }
) {
  const commandName = "journey.update_event"
  const idempotencyKey = input.idempotencyKey ?? input.commandId
  const commandHash = evalContentHash({
    commandName,
    idempotencyKey,
    seed: input.commandHashSeed,
  })
  await sink.emit({
    runId: "write-run",
    scenarioId: "write-scenario",
    type: "command.dispatched",
    spanId: input.spanId,
    parentSpanId: "run-span",
    workspaceId: "workspace-1",
    commandId: input.commandId,
    revisionBefore: input.revisionBefore,
    status: "OK",
    payload: { commandName, idempotencyKey, commandHash },
  })
  await sink.emit({
    runId: "write-run",
    scenarioId: "write-scenario",
    type: "command.rejected",
    spanId: input.spanId,
    parentSpanId: "run-span",
    workspaceId: "workspace-1",
    commandId: input.commandId,
    revisionBefore: input.revisionBefore,
    status: "ERROR",
    payload: {
      commandName,
      errorName: "WorkspaceRevisionConflictError",
      errorMessage: "Workspace revision conflict",
    },
  })
}

describe("Agent feature capability validators", () => {
  it("passes a resolved Place with city, coordinate, provider, and bound evidence", async () => {
    const result = {
      status: "resolved" as const,
      place: westLake(),
      warnings: [],
    }
    const evidenceId = "evidence-west-lake"
    const traceEvents = await recordedPlaceEvidence(
      result,
      evidenceId,
      result.status
    )
    const report = validatePlaceCapability({
      id: "west-lake-resolved",
      result,
      expectation: {
        status: "resolved",
        city: "杭州",
        coordinateSystem: "GCJ02",
        coordinateNear: {
          lat: 30.25,
          lng: 120.15,
          maxErrorMeters: 20,
        },
        requireProviderIdentity: true,
        requireEvidence: true,
      },
      evidenceId,
      traceEvents,
    })

    expect(report.hardPass).toBe(true)
    expect(report.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "city_match", status: "PASS" }),
        expect.objectContaining({
          id: "coordinate_error_m",
          status: "PASS",
        }),
      ])
    )
  })

  it("hard-fails a wrong-city Place even when the provider confidence is high", () => {
    const place = westLake()
    place.city = "南昌市"
    const report = validatePlaceCapability({
      id: "wrong-city",
      result: { status: "resolved", place, warnings: [] },
      expectation: { status: "resolved", city: "杭州" },
    })

    expect(report.hardPass).toBe(false)
    expect(report.metrics).toContainEqual(
      expect.objectContaining({ id: "city_match", status: "FAIL", hard: true })
    )
  })

  it("fails a ready Place whose command targets another Event and rewrites provider coordinates", () => {
    const place = westLake()
    const report = validatePlaceCapability({
      id: "forged-ready-command",
      result: {
        status: "ready",
        place,
        command: {
          name: "journey.update_event",
          payload: {
            eventId: "wrong-event",
            patch: {
              type: "VISIT",
              detail: {
                plannedLat: 0,
                plannedLng: 0,
                coordinateSystem: "WGS84",
                coordinateProvider: "osm",
                providerPlaceId: "wrong-provider-id",
              },
            },
          },
        },
        warnings: [],
      },
      expectation: {
        status: "ready",
        expectedEventId: "west-lake-event",
        expectedEventType: "VISIT",
      },
    })

    expect(report.hardPass).toBe(false)
    expect(report.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "ready_command_target", status: "FAIL" }),
        expect.objectContaining({
          id: "ready_command_coordinate",
          status: "FAIL",
        }),
        expect.objectContaining({
          id: "ready_command_provider",
          status: "FAIL",
        }),
      ])
    )
  })

  it("fails Place evidence that is only a non-empty unbound id", () => {
    const report = validatePlaceCapability({
      id: "unbound-evidence",
      result: { status: "resolved", place: westLake(), warnings: [] },
      expectation: { status: "resolved", requireEvidence: true },
      evidenceId: "invented-evidence-id",
      traceEvents: [],
    })

    expect(report.hardPass).toBe(false)
    expect(report.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "evidence_trace_integrity",
          status: "FAIL",
        }),
        expect.objectContaining({ id: "evidence_reference", status: "FAIL" }),
      ])
    )
  })

  it("enforces required evidence for not_found and ambiguous Place decisions", () => {
    const results: PlaceResolveResult[] = [
      {
        status: "not_found",
        fallbackQuery: { query: "不存在的地点" },
        reason: "no provider match",
        warnings: [],
      },
      {
        status: "ambiguous",
        candidates: [westLake()],
        question: "请确认具体地点",
        warnings: [],
      },
    ]

    for (const result of results) {
      const report = validatePlaceCapability({
        id: `missing-evidence-${result.status}`,
        result,
        expectation: { status: result.status, requireEvidence: true },
        traceEvents: [],
      })
      expect(report.hardPass).toBe(false)
      expect(report.metrics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "evidence_trace_integrity",
            status: "FAIL",
          }),
          expect.objectContaining({
            id: "evidence_reference",
            status: "FAIL",
          }),
        ])
      )
    }
  })

  it("rejects Place evidence whose self-reported toolType disagrees with its parent tool", async () => {
    const result = {
      status: "resolved" as const,
      place: westLake(),
      warnings: [],
    }
    const evidenceId = "forged-place-evidence"
    const sink = new MemoryEvalTraceSink()
    await sink.emit({
      runId: "place-run",
      scenarioId: "place-scenario",
      type: "run.started",
      spanId: "run-span",
      status: "OK",
      payload: {},
    })
    await sink.emit({
      runId: "place-run",
      scenarioId: "place-scenario",
      type: "tool.started",
      spanId: "workspace-tool-span",
      parentSpanId: "run-span",
      status: "OK",
      payload: { toolType: "workspace.get" },
    })
    await sink.emit({
      runId: "place-run",
      scenarioId: "place-scenario",
      type: "evidence.recorded",
      spanId: "evidence-span",
      parentSpanId: "workspace-tool-span",
      status: "OK",
      payload: {
        evidenceId,
        toolType: "place.resolve",
        contentHash: evalContentHash(result),
        resultStatus: result.status,
      },
    })
    await sink.emit({
      runId: "place-run",
      scenarioId: "place-scenario",
      type: "tool.completed",
      spanId: "workspace-tool-span",
      parentSpanId: "run-span",
      status: "OK",
      payload: { toolType: "workspace.get" },
    })
    await sink.emit({
      runId: "place-run",
      scenarioId: "place-scenario",
      type: "run.completed",
      spanId: "run-span",
      status: "OK",
      payload: {},
    })

    expect(verifyEvalTrace(sink.events).valid).toBe(false)
    const report = validatePlaceCapability({
      id: "forged-tool-provenance",
      result,
      expectation: { status: "resolved", requireEvidence: true },
      evidenceId,
      traceEvents: sink.events,
    })
    expect(report.hardPass).toBe(false)
    expect(report.metrics).toContainEqual(
      expect.objectContaining({
        id: "evidence_trace_integrity",
        status: "FAIL",
      })
    )
  })

  it("rejects place.search evidence for a Place resolve decision", async () => {
    const result = {
      status: "resolved" as const,
      place: westLake(),
      warnings: [],
    }
    const evidenceId = "search-evidence"
    const sink = new MemoryEvalTraceSink()
    await sink.emit({
      runId: "place-run",
      scenarioId: "place-scenario",
      type: "run.started",
      spanId: "run-span",
      status: "OK",
      payload: {},
    })
    await sink.emit({
      runId: "place-run",
      scenarioId: "place-scenario",
      type: "tool.started",
      spanId: "search-tool-span",
      parentSpanId: "run-span",
      status: "OK",
      payload: { toolType: "place.search" },
    })
    await sink.emit({
      runId: "place-run",
      scenarioId: "place-scenario",
      type: "evidence.recorded",
      spanId: "evidence-span",
      parentSpanId: "search-tool-span",
      status: "OK",
      payload: {
        evidenceId,
        toolType: "place.search",
        contentHash: evalContentHash(result),
        resultStatus: result.status,
      },
    })
    await sink.emit({
      runId: "place-run",
      scenarioId: "place-scenario",
      type: "tool.completed",
      spanId: "search-tool-span",
      parentSpanId: "run-span",
      status: "OK",
      payload: { toolType: "place.search" },
    })
    await sink.emit({
      runId: "place-run",
      scenarioId: "place-scenario",
      type: "run.completed",
      spanId: "run-span",
      status: "OK",
      payload: {},
    })

    expect(verifyEvalTrace(sink.events)).toEqual({ valid: true, issues: [] })
    const report = validatePlaceCapability({
      id: "search-cannot-prove-resolve",
      result,
      expectation: { status: "resolved", requireEvidence: true },
      evidenceId,
      traceEvents: sink.events,
    })
    expect(report.hardPass).toBe(false)
    expect(report.metrics).toContainEqual(
      expect.objectContaining({ id: "evidence_reference", status: "FAIL" })
    )
  })

  it("validates selected TransitPlan membership, geometry, scope, and request fingerprint", () => {
    const fixture = TARGET_CONTRACT_FIXTURES.find(
      (candidate) => candidate.id === "03-transit-plan-choice"
    )!.cases[0]!
    const graph = structuredClone(fixture.expected.state!.graph!)
    alignTransitFixtureDestination(graph)
    graph.transitPlanningRuns[0]!.plans.find(
      (plan) => plan.id === "plan-low-cost"
    )!.distanceMeters = 15_000
    const transit = graph.events.find(
      (event): event is Extract<TargetJourneyEvent, { type: "TRANSIT" }> =>
        event.id === "transit" && event.type === "TRANSIT"
    )!
    const request = buildTransitPlanRequest(transit, graph.events)!
    const fingerprint = transitPlanFingerprint(request)
    graph.transitPlanningRuns[0]!.requestFingerprint = fingerprint

    const report = validateTransitCapability({
      id: "selected-low-cost",
      graph,
      transitEventId: "transit",
      expectedSelectedPlanId: "plan-low-cost",
      expectedRequestFingerprint: fingerprint,
    })

    expect(report.hardPass).toBe(true)
    expect(report.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "selected_geometry",
          status: "PASS",
        }),
        expect.objectContaining({
          id: "request_fingerprint",
          status: "PASS",
        }),
      ])
    )
  })

  it("fails selected Transit geometry that is valid-shaped but detached from its endpoints", () => {
    const fixture = TARGET_CONTRACT_FIXTURES.find(
      (candidate) => candidate.id === "03-transit-plan-choice"
    )!.cases[0]!
    const graph = structuredClone(fixture.expected.state!.graph!)
    alignTransitFixtureDestination(graph)
    const transit = graph.events.find(
      (event): event is Extract<TargetJourneyEvent, { type: "TRANSIT" }> =>
        event.id === "transit" && event.type === "TRANSIT"
    )!
    const request = buildTransitPlanRequest(transit, graph.events)!
    const fingerprint = transitPlanFingerprint(request)
    graph.transitPlanningRuns[0]!.requestFingerprint = fingerprint
    const selectedPlan = graph.transitPlanningRuns[0]!.plans.find(
      (plan) => plan.id === transit.detail.selectedPlanId
    )!
    selectedPlan.distanceMeters = 15_000
    selectedPlan.segments[0]!.positions = [
      [0, 0],
      [1, 1],
    ]

    const report = validateTransitCapability({
      id: "detached-selected-geometry",
      graph,
      transitEventId: transit.id,
      expectedSelectedPlanId: selectedPlan.id,
      expectedRequestFingerprint: fingerprint,
    })

    expect(report.hardPass).toBe(false)
    expect(report.metrics).toContainEqual(
      expect.objectContaining({ id: "geometry_endpoints", status: "FAIL" })
    )
  })

  it("fails discontinuous, misordered, mixed-coordinate segments and partial aggregates", () => {
    const fixture = TARGET_CONTRACT_FIXTURES.find(
      (candidate) => candidate.id === "03-transit-plan-choice"
    )!.cases[0]!
    const graph = structuredClone(fixture.expected.state!.graph!)
    alignTransitFixtureDestination(graph)
    const transit = graph.events.find(
      (event): event is Extract<TargetJourneyEvent, { type: "TRANSIT" }> =>
        event.id === "transit" && event.type === "TRANSIT"
    )!
    const selectedPlan = graph.transitPlanningRuns[0]!.plans.find(
      (plan) => plan.id === transit.detail.selectedPlanId
    )!
    selectedPlan.distanceMeters = 15_000
    selectedPlan.segments = [
      {
        ...selectedPlan.segments[0]!,
        id: "segment-first",
        order: 0,
        distanceMeters: 100,
        positions: [
          [120.15, 30.25],
          [120.18, 30.28],
        ],
      },
      {
        ...selectedPlan.segments[0]!,
        id: "segment-second",
        order: 2,
        coordinateSystem: "WGS84",
        distanceMeters: undefined,
        positions: [
          [121, 31],
          [120.25, 30.35],
        ],
      },
    ]
    const request = buildTransitPlanRequest(transit, graph.events)!
    const fingerprint = transitPlanFingerprint(request)
    graph.transitPlanningRuns[0]!.requestFingerprint = fingerprint

    const report = validateTransitCapability({
      id: "invalid-segment-chain",
      graph,
      transitEventId: transit.id,
      expectedSelectedPlanId: selectedPlan.id,
      expectedRequestFingerprint: fingerprint,
    })

    expect(report.hardPass).toBe(false)
    for (const id of [
      "segment_order",
      "geometry_coordinate_system",
      "geometry_continuity",
      "plan_aggregates",
    ]) {
      expect(report.metrics).toContainEqual(
        expect.objectContaining({ id, status: "FAIL" })
      )
    }
  })

  it("fails a non-zero Transit plan with zero duration and no segment durations", () => {
    const fixture = TARGET_CONTRACT_FIXTURES.find(
      (candidate) => candidate.id === "03-transit-plan-choice"
    )!.cases[0]!
    const graph = structuredClone(fixture.expected.state!.graph!)
    alignTransitFixtureDestination(graph)
    const transit = graph.events.find(
      (event): event is Extract<TargetJourneyEvent, { type: "TRANSIT" }> =>
        event.id === "transit" && event.type === "TRANSIT"
    )!
    const selectedPlan = graph.transitPlanningRuns[0]!.plans.find(
      (plan) => plan.id === transit.detail.selectedPlanId
    )!
    selectedPlan.distanceMeters = 15_000
    selectedPlan.durationSeconds = 0
    for (const segment of selectedPlan.segments) {
      segment.distanceMeters = undefined
      segment.durationSeconds = undefined
    }
    const request = buildTransitPlanRequest(transit, graph.events)!
    const fingerprint = transitPlanFingerprint(request)
    graph.transitPlanningRuns[0]!.requestFingerprint = fingerprint

    const report = validateTransitCapability({
      id: "zero-duration-nonzero-route",
      graph,
      transitEventId: transit.id,
      expectedSelectedPlanId: selectedPlan.id,
      expectedRequestFingerprint: fingerprint,
    })

    expect(report.hardPass).toBe(false)
    expect(report.metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "plan_duration", status: "FAIL" }),
        expect.objectContaining({ id: "plan_aggregates", status: "FAIL" }),
      ])
    )
  })

  it("fails Transit capability at the graph contract when selectedPlanId is invalid", () => {
    const fixture = TARGET_CONTRACT_FIXTURES.find(
      (candidate) => candidate.id === "03-transit-plan-choice"
    )!.cases[0]!
    const graph = structuredClone(fixture.expected.state!.graph!)
    const transit = graph.events.find((event) => event.id === "transit")
    if (transit?.type !== "TRANSIT") throw new Error("fixture invariant")
    transit.detail.selectedPlanId = "missing-plan"

    const report = validateTransitCapability({
      id: "missing-selected-plan",
      graph,
      transitEventId: "transit",
    })
    expect(report.hardPass).toBe(false)
    expect(report.metrics).toContainEqual(
      expect.objectContaining({
        id: "graph_contract",
        status: "FAIL",
      })
    )
  })

  it("fails Transit capability when the active run fingerprint is stale", () => {
    const fixture = TARGET_CONTRACT_FIXTURES.find(
      (candidate) => candidate.id === "03-transit-plan-choice"
    )!.cases[0]!
    const graph = structuredClone(fixture.expected.state!.graph!)

    const report = validateTransitCapability({
      id: "stale-fingerprint",
      graph,
      transitEventId: "transit",
      expectedSelectedPlanId: "plan-low-cost",
    })
    expect(report.hardPass).toBe(false)
    expect(report.metrics).toContainEqual(
      expect.objectContaining({ id: "request_fingerprint", status: "FAIL" })
    )
  })

  it("derives the F6 write-protocol gate from the same trace contract", async () => {
    const sink = new MemoryEvalTraceSink()
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "run.started",
      spanId: "run-span",
      status: "OK",
      payload: {},
    })
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "command.dispatched",
      spanId: "command-span",
      parentSpanId: "run-span",
      commandId: "command-1",
      revisionBefore: 2,
      status: "OK",
      payload: {
        commandName: "journey.update_event",
        idempotencyKey: "command-1",
        commandHash,
      },
    })
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "state.diff.recorded",
      spanId: "command-span",
      parentSpanId: "run-span",
      commandId: "command-1",
      revisionBefore: 2,
      revisionAfter: 3,
      status: "OK",
      payload: {
        changedEventIds: ["event-1"],
        projectionInvalidationScopes: ["journey"],
      },
    })
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "command.applied",
      spanId: "command-span",
      parentSpanId: "run-span",
      commandId: "command-1",
      revisionBefore: 2,
      revisionAfter: 3,
      status: "OK",
      payload: {
        commandName: "journey.update_event",
        replayedFromIdempotencyKey: false,
      },
    })
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "run.completed",
      spanId: "run-span",
      status: "OK",
      payload: {},
    })

    const report = validateWriteProtocolCapability("write-applied", sink.events)
    expect(report.hardPass).toBe(true)
  })

  it("fails F6 when a later command regresses below the revision floor", async () => {
    const sink = new MemoryEvalTraceSink()
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "run.started",
      spanId: "run-span",
      workspaceId: "workspace-1",
      status: "OK",
      payload: {},
    })
    await emitWriteCommand(sink, {
      spanId: "command-span-1",
      commandId: "command-1",
      revisionBefore: 5,
      revisionAfter: 6,
      replayed: false,
    })
    await emitWriteCommand(sink, {
      spanId: "command-span-2",
      commandId: "command-2",
      revisionBefore: 1,
      revisionAfter: 2,
      replayed: false,
    })
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "run.completed",
      spanId: "run-span",
      workspaceId: "workspace-1",
      status: "OK",
      payload: {},
    })

    expect(verifyEvalTrace(sink.events).valid).toBe(false)
    const report = validateWriteProtocolCapability(
      "revision-floor-regression",
      sink.events
    )
    expect(report.hardPass).toBe(false)
    expect(report.metrics).toContainEqual(
      expect.objectContaining({ id: "revision_monotonic", status: "FAIL" })
    )
  })

  it("fails F6 when an idempotency key is reused for another command hash", async () => {
    const sink = new MemoryEvalTraceSink()
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "run.started",
      spanId: "run-span",
      workspaceId: "workspace-1",
      status: "OK",
      payload: {},
    })
    await emitWriteCommand(sink, {
      spanId: "command-span-1",
      commandId: "derived-command-id",
      idempotencyKey: "shared-key",
      commandHashSeed: "first-payload",
      revisionBefore: 0,
      revisionAfter: 1,
      replayed: false,
    })
    await emitWriteCommand(sink, {
      spanId: "command-span-2",
      commandId: "derived-command-id",
      idempotencyKey: "shared-key",
      commandHashSeed: "different-payload",
      revisionBefore: 1,
      revisionAfter: 2,
      replayed: false,
    })
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "run.completed",
      spanId: "run-span",
      workspaceId: "workspace-1",
      status: "OK",
      payload: {},
    })

    const integrity = verifyEvalTrace(sink.events)
    expect(integrity.valid).toBe(false)
    expect(integrity.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "reused an applied outcome without typed replay"
        ),
      ])
    )
    expect(
      validateWriteProtocolCapability("idempotency-collision", sink.events)
        .hardPass
    ).toBe(false)
  })

  it("accepts an exact typed replay without a second state diff", async () => {
    const sink = new MemoryEvalTraceSink()
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "run.started",
      spanId: "run-span",
      workspaceId: "workspace-1",
      status: "OK",
      payload: {},
    })
    await emitWriteCommand(sink, {
      spanId: "command-span-1",
      commandId: "command-1",
      idempotencyKey: "shared-key",
      revisionBefore: 5,
      revisionAfter: 6,
      replayed: false,
    })
    await emitWriteCommand(sink, {
      spanId: "command-span-replay",
      commandId: "command-1",
      idempotencyKey: "shared-key",
      revisionBefore: 5,
      revisionAfter: 6,
      replayed: true,
    })
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "run.completed",
      spanId: "run-span",
      workspaceId: "workspace-1",
      status: "OK",
      payload: {},
    })

    expect(verifyEvalTrace(sink.events)).toEqual({ valid: true, issues: [] })
    expect(
      sink.events.filter((event) => event.type === "state.diff.recorded")
    ).toHaveLength(1)
    expect(
      validateWriteProtocolCapability("exact-idempotent-replay", sink.events)
        .hardPass
    ).toBe(true)
  })

  it("allows a rejected idempotency key to apply first after a revision refresh", async () => {
    const sink = new MemoryEvalTraceSink()
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "run.started",
      spanId: "run-span",
      workspaceId: "workspace-1",
      status: "OK",
      payload: {},
    })
    await emitRejectedWriteCommand(sink, {
      spanId: "rejected-command-span-1",
      commandId: "retry-command",
      idempotencyKey: "retry-key",
      revisionBefore: 0,
    })
    await emitRejectedWriteCommand(sink, {
      spanId: "rejected-command-span-2",
      commandId: "retry-command",
      idempotencyKey: "retry-key",
      revisionBefore: 0,
    })
    await emitWriteCommand(sink, {
      spanId: "applied-command-span",
      commandId: "retry-command",
      idempotencyKey: "retry-key",
      revisionBefore: 1,
      revisionAfter: 2,
      replayed: false,
    })
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "run.completed",
      spanId: "run-span",
      workspaceId: "workspace-1",
      status: "OK",
      payload: {},
    })

    expect(verifyEvalTrace(sink.events)).toEqual({ valid: true, issues: [] })
    expect(
      validateWriteProtocolCapability(
        "rejected-then-first-authoritative-apply",
        sink.events
      ).hardPass
    ).toBe(true)
  })

  it("rejects different command content reusing a rejected idempotency key", async () => {
    const sink = new MemoryEvalTraceSink()
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "run.started",
      spanId: "run-span",
      workspaceId: "workspace-1",
      status: "OK",
      payload: {},
    })
    await emitRejectedWriteCommand(sink, {
      spanId: "rejected-command-span",
      commandId: "retry-command",
      idempotencyKey: "retry-key",
      commandHashSeed: "first-payload",
      revisionBefore: 0,
    })
    await emitWriteCommand(sink, {
      spanId: "forged-command-span",
      commandId: "retry-command",
      idempotencyKey: "retry-key",
      commandHashSeed: "different-payload",
      revisionBefore: 1,
      revisionAfter: 2,
      replayed: false,
    })
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "run.completed",
      spanId: "run-span",
      workspaceId: "workspace-1",
      status: "OK",
      payload: {},
    })

    const integrity = verifyEvalTrace(sink.events)
    expect(integrity.valid).toBe(false)
    expect(integrity.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining("changed command identity after rejection"),
      ])
    )
    expect(
      validateWriteProtocolCapability(
        "rejected-key-command-conflict",
        sink.events
      ).hardPass
    ).toBe(false)
  })

  it("fails F6 when a forged command lifecycle has no root run", async () => {
    const sink = new MemoryEvalTraceSink()
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "command.dispatched",
      spanId: "command-span",
      commandId: "command-1",
      revisionBefore: 0,
      status: "OK",
      payload: {
        commandName: "journey.update_event",
        idempotencyKey: "command-1",
        commandHash,
      },
    })
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "state.diff.recorded",
      spanId: "command-span",
      commandId: "command-1",
      revisionBefore: 0,
      revisionAfter: 1,
      status: "OK",
      payload: {
        changedEventIds: ["event-1"],
        projectionInvalidationScopes: ["journey"],
      },
    })
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "command.applied",
      spanId: "command-span",
      commandId: "command-1",
      revisionBefore: 0,
      revisionAfter: 1,
      status: "OK",
      payload: {
        commandName: "journey.update_event",
        replayedFromIdempotencyKey: false,
      },
    })

    const report = validateWriteProtocolCapability("forged-write", sink.events)
    expect(report.hardPass).toBe(false)
    expect(report.metrics).toContainEqual(
      expect.objectContaining({ id: "trace_integrity", status: "FAIL" })
    )
  })

  it("fails capability reports closed when no hard metric exists", () => {
    expect(capabilityReport("F0-contract", "empty", []).hardPass).toBe(false)
    expect(
      capabilityReport("F0-contract", "soft-only", [
        {
          id: "soft_metric",
          status: "PASS",
          hard: false,
          message: "soft evidence is not a hard gate",
        },
      ]).hardPass
    ).toBe(false)
    expect(
      capabilityReport("F0-contract", "hard-skipped", [
        {
          id: "hard_metric",
          status: "SKIPPED",
          hard: true,
          message: "missing hard evidence",
        },
      ]).hardPass
    ).toBe(false)
  })

  it("rejects persisted reports whose hardPass contradicts their metrics", () => {
    expect(
      evalCapabilityReportSchema.safeParse({
        pack: "F0-contract",
        caseId: "forged-report",
        hardPass: true,
        metrics: [
          {
            id: "hard_failure",
            status: "FAIL",
            hard: true,
            message: "hard gate failed",
          },
        ],
      }).success
    ).toBe(false)
    expect(
      evalCapabilityReportSchema.safeParse({
        pack: "F0-contract",
        caseId: "forged-skipped-report",
        hardPass: true,
        metrics: [
          {
            id: "hard_missing",
            status: "SKIPPED",
            hard: true,
            message: "hard evidence missing",
          },
        ],
      }).success
    ).toBe(false)
  })
})
