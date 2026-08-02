import {
  MemoryEvalTraceSink,
  validatePlaceCapability,
  validateTransitCapability,
  validateWriteProtocolCapability,
  type EvalCapabilityReport,
} from "../backend/agent/evals"
import {
  buildTransitPlanRequest,
  transitPlanFingerprint,
} from "../lib/journeys/planning"
import type { PlaceSearchResult } from "../lib/places/types"
import {
  TARGET_CONTRACT_FIXTURES,
  type TargetJourneyEvent,
} from "../modules/data-model/contracts"

function resolvedWestLake(): PlaceSearchResult {
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
    reason: "recorded provider exact match",
  }
}

function transitReport() {
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
  return validateTransitCapability({
    id: "contract-selected-low-cost",
    graph,
    transitEventId: transit.id,
    expectedSelectedPlanId: "plan-low-cost",
    expectedRequestFingerprint: fingerprint,
  })
}

async function writeProtocolReport() {
  const sink = new MemoryEvalTraceSink()
  await sink.emit({
    runId: "smoke-write-run",
    scenarioId: "smoke-write-protocol",
    type: "run.started",
    spanId: "run-span",
    status: "OK",
    payload: {},
  })
  await sink.emit({
    runId: "smoke-write-run",
    scenarioId: "smoke-write-protocol",
    type: "command.dispatched",
    spanId: "command-span",
    parentSpanId: "run-span",
    revisionBefore: 0,
    status: "OK",
    payload: { commandName: "journey.update_event" },
  })
  await sink.emit({
    runId: "smoke-write-run",
    scenarioId: "smoke-write-protocol",
    type: "command.applied",
    spanId: "command-span",
    parentSpanId: "run-span",
    revisionBefore: 0,
    revisionAfter: 1,
    status: "OK",
    payload: { commandName: "journey.update_event" },
  })
  await sink.emit({
    runId: "smoke-write-run",
    scenarioId: "smoke-write-protocol",
    type: "run.completed",
    spanId: "run-span",
    status: "OK",
    payload: {},
  })
  await sink.close()
  return validateWriteProtocolCapability("applied-command", sink.events)
}

const reports: EvalCapabilityReport[] = [
  validatePlaceCapability({
    id: "recorded-west-lake",
    result: { status: "resolved", place: resolvedWestLake(), warnings: [] },
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
    evidenceId: "cassette:place:west-lake",
  }),
  transitReport(),
  await writeProtocolReport(),
]

const summary = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  hardPass: reports.every((report) => report.hardPass),
  reports,
}

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
if (!summary.hardPass) process.exitCode = 1
