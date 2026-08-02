import { describe, expect, it } from "vitest"
import {
  MemoryEvalTraceSink,
  validatePlaceCapability,
  validateTransitCapability,
  validateWriteProtocolCapability,
} from "@/backend/agent/evals"
import {
  buildTransitPlanRequest,
  transitPlanFingerprint,
} from "@/lib/journeys/planning"
import type { PlaceSearchResult } from "@/lib/places/types"
import {
  TARGET_CONTRACT_FIXTURES,
  type TargetJourneyEvent,
} from "@/modules/data-model/contracts"

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

describe("Agent feature capability validators", () => {
  it("passes a resolved Place with city, coordinate, provider, and evidence", () => {
    const report = validatePlaceCapability({
      id: "west-lake-resolved",
      result: { status: "resolved", place: westLake(), warnings: [] },
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
      evidenceId: "evidence-west-lake",
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

  it("validates selected TransitPlan membership, geometry, scope, and request fingerprint", () => {
    const fixture = TARGET_CONTRACT_FIXTURES.find(
      (candidate) => candidate.id === "03-transit-plan-choice"
    )!.cases[0]!
    const graph = structuredClone(fixture.expected.state!.graph!)
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
      revisionBefore: 2,
      status: "OK",
      payload: {},
    })
    await sink.emit({
      runId: "write-run",
      scenarioId: "write-scenario",
      type: "command.applied",
      spanId: "command-span",
      parentSpanId: "run-span",
      revisionBefore: 2,
      revisionAfter: 3,
      status: "OK",
      payload: {},
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
})
