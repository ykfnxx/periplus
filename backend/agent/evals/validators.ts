import type {
  PlaceResolveForJourneyEventResult,
  PlaceResolveResult,
  PlaceSearchResult,
} from "@/lib/places/types"
import {
  buildTransitPlanRequest,
  transitPlanFingerprint,
} from "@/lib/journeys/planning"
import {
  targetJourneyGraphSnapshotSchema,
  type TargetJourneyEvent,
  type TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import {
  capabilityReport,
  type EvalCapabilityReport,
  type EvalMetricResult,
  type EvalTraceEvent,
} from "./contracts"
import { verifyEvalTrace } from "./trace"

type PlaceCapabilityResult =
  | PlaceResolveResult
  | PlaceResolveForJourneyEventResult

export interface PlaceCapabilityExpectation {
  status: PlaceCapabilityResult["status"]
  city?: string
  coordinateSystem?: string
  coordinateNear?: { lat: number; lng: number; maxErrorMeters: number }
  requireProviderIdentity?: boolean
  requireEvidence?: boolean
}

export interface PlaceCapabilityCase {
  id: string
  result: PlaceCapabilityResult
  expectation: PlaceCapabilityExpectation
  evidenceId?: string
}

export interface TransitCapabilityCase {
  id: string
  graph: TargetJourneyGraphSnapshot
  transitEventId: string
  expectedSelectedPlanId?: string
  expectedRequestFingerprint?: string
}

function metric(
  id: string,
  pass: boolean,
  message: string,
  options: {
    hard?: boolean
    value?: string | number | boolean
    expected?: string | number | boolean
  } = {}
): EvalMetricResult {
  return {
    id,
    status: pass ? "PASS" : "FAIL",
    hard: options.hard ?? true,
    value: options.value,
    expected: options.expected,
    message,
  }
}

function skipped(id: string, message: string): EvalMetricResult {
  return { id, status: "SKIPPED", hard: false, message }
}

function normalizedPlace(value: string | undefined) {
  return value
    ?.trim()
    .replace(/[市县区]$/, "")
    .toLocaleLowerCase("zh-CN")
}

function resolvedPlace(
  result: PlaceCapabilityResult
): PlaceSearchResult | null {
  return result.status === "resolved" || result.status === "ready"
    ? result.place
    : null
}

function distanceMeters(
  left: { lat: number; lng: number },
  right: { lat: number; lng: number }
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180
  const earthRadiusMeters = 6_371_008.8
  const deltaLat = radians(right.lat - left.lat)
  const deltaLng = radians(right.lng - left.lng)
  const leftLat = radians(left.lat)
  const rightLat = radians(right.lat)
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(leftLat) * Math.cos(rightLat) * Math.sin(deltaLng / 2) ** 2
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function validatePlaceCapability(
  testCase: PlaceCapabilityCase
): EvalCapabilityReport {
  const metrics: EvalMetricResult[] = []
  metrics.push(
    metric(
      "resolution_status",
      testCase.result.status === testCase.expectation.status,
      "Place resolution returns the expected decision state",
      {
        value: testCase.result.status,
        expected: testCase.expectation.status,
      }
    )
  )

  const place = resolvedPlace(testCase.result)
  if (!place) {
    if (
      testCase.expectation.status === "resolved" ||
      testCase.expectation.status === "ready"
    ) {
      metrics.push(
        metric("resolved_place", false, "Expected a resolved Place result")
      )
    } else {
      metrics.push(skipped("resolved_place", "Case intentionally has no Place"))
    }
    return capabilityReport("F1-place", testCase.id, metrics)
  }

  if (testCase.expectation.city) {
    const actualCity = normalizedPlace(place.city ?? place.province)
    const expectedCity = normalizedPlace(testCase.expectation.city)
    metrics.push(
      metric(
        "city_match",
        actualCity === expectedCity,
        "Resolved Place belongs to the expected city",
        { value: actualCity ?? "", expected: expectedCity ?? "" }
      )
    )
  } else {
    metrics.push(skipped("city_match", "No expected city was provided"))
  }

  if (testCase.expectation.coordinateSystem) {
    metrics.push(
      metric(
        "coordinate_system",
        place.bestCoordinate.coordinateSystem ===
          testCase.expectation.coordinateSystem,
        "Resolved coordinate uses the expected coordinate system",
        {
          value: place.bestCoordinate.coordinateSystem,
          expected: testCase.expectation.coordinateSystem,
        }
      )
    )
  } else {
    metrics.push(
      skipped("coordinate_system", "No expected coordinate system was provided")
    )
  }

  if (testCase.expectation.coordinateNear) {
    const errorMeters = distanceMeters(
      place.bestCoordinate,
      testCase.expectation.coordinateNear
    )
    metrics.push(
      metric(
        "coordinate_error_m",
        errorMeters <= testCase.expectation.coordinateNear.maxErrorMeters,
        "Resolved coordinate falls within the allowed error radius",
        {
          value: Math.round(errorMeters * 100) / 100,
          expected: testCase.expectation.coordinateNear.maxErrorMeters,
        }
      )
    )
  } else {
    metrics.push(skipped("coordinate_error_m", "No coordinate anchor provided"))
  }

  if (testCase.expectation.requireProviderIdentity) {
    const hasIdentity = place.sources.some(
      (source) => source.provider !== "periplus" && source.providerId
    )
    metrics.push(
      metric(
        "provider_identity",
        Boolean(hasIdentity),
        "Resolved Place retains an external provider identity"
      )
    )
  }
  if (testCase.expectation.requireEvidence) {
    metrics.push(
      metric(
        "evidence_reference",
        Boolean(testCase.evidenceId?.trim()),
        "Resolved Place is linked to recorded tool evidence"
      )
    )
  }
  return capabilityReport("F1-place", testCase.id, metrics)
}

function activeAtRevision(
  value: { introducedRevision: number; retiredRevision?: number | null },
  revision: number
) {
  return (
    value.introducedRevision <= revision &&
    (value.retiredRevision == null || value.retiredRevision > revision)
  )
}

function transitEvent(
  graph: TargetJourneyGraphSnapshot,
  eventId: string
): Extract<TargetJourneyEvent, { type: "TRANSIT" }> | null {
  const event = graph.events.find((candidate) => candidate.id === eventId)
  return event?.type === "TRANSIT" && activeAtRevision(event, graph.revision)
    ? event
    : null
}

export function validateTransitCapability(
  testCase: TransitCapabilityCase
): EvalCapabilityReport {
  const parsed = targetJourneyGraphSnapshotSchema.safeParse(testCase.graph)
  if (!parsed.success) {
    return capabilityReport("F2-transit", testCase.id, [
      metric("graph_contract", false, "Journey graph failed target schema"),
    ])
  }
  const graph = parsed.data
  const event = transitEvent(graph, testCase.transitEventId)
  if (!event) {
    return capabilityReport("F2-transit", testCase.id, [
      metric("transit_event", false, "Active Transit Event was not found"),
    ])
  }
  const metrics: EvalMetricResult[] = [
    metric("graph_contract", true, "Journey graph satisfies target schema"),
  ]
  const from = graph.events.find(
    (candidate) => candidate.id === event.detail.plannedFromEventId
  )
  const to = graph.events.find(
    (candidate) => candidate.id === event.detail.plannedToEventId
  )
  const endpointsAreActive =
    Boolean(from && to) &&
    activeAtRevision(from!, graph.revision) &&
    activeAtRevision(to!, graph.revision)
  metrics.push(
    metric(
      "active_endpoints",
      endpointsAreActive,
      "Transit endpoints are active Events in the Journey"
    )
  )
  metrics.push(
    metric(
      "endpoint_scope",
      Boolean(
        from &&
        to &&
        from.parentSectionEventId === event.parentSectionEventId &&
        to.parentSectionEventId === event.parentSectionEventId
      ),
      "Transit Event and endpoints share one route scope"
    )
  )

  const run = graph.transitPlanningRuns.find(
    (candidate) => candidate.id === event.detail.activePlanningRunId
  )
  metrics.push(
    metric(
      "active_ready_run",
      event.detail.routeState === "READY" && run?.status === "READY",
      "READY Transit references a READY planning run"
    )
  )
  const selectedPlan = run?.plans.find(
    (candidate) => candidate.id === event.detail.selectedPlanId
  )
  metrics.push(
    metric(
      "selected_plan_membership",
      Boolean(selectedPlan),
      "selectedPlanId belongs to the active planning run"
    )
  )
  if (testCase.expectedSelectedPlanId) {
    metrics.push(
      metric(
        "selected_plan",
        event.detail.selectedPlanId === testCase.expectedSelectedPlanId,
        "Transit exposes the expected selected plan",
        {
          value: event.detail.selectedPlanId ?? "",
          expected: testCase.expectedSelectedPlanId,
        }
      )
    )
  }
  const geometryIsUsable = Boolean(
    selectedPlan?.segments.length &&
    selectedPlan.segments.every(
      (segment) =>
        segment.positions.length >= 2 &&
        segment.positions.every(
          ([lng, lat]) =>
            Number.isFinite(lng) &&
            Number.isFinite(lat) &&
            lng >= -180 &&
            lng <= 180 &&
            lat >= -90 &&
            lat <= 90
        )
    )
  )
  metrics.push(
    metric(
      "selected_geometry",
      geometryIsUsable,
      "Selected plan exposes renderable segment geometry"
    )
  )

  const request = buildTransitPlanRequest(event, graph.events)
  if (request && run) {
    const fingerprint = transitPlanFingerprint(request)
    const expectedFingerprint =
      testCase.expectedRequestFingerprint ?? run.requestFingerprint
    metrics.push(
      metric(
        "request_fingerprint",
        fingerprint === expectedFingerprint &&
          run.requestFingerprint === expectedFingerprint,
        "Active run fingerprint matches the current Transit request",
        {
          value: `${fingerprint}:${run.requestFingerprint}`,
          expected: `${expectedFingerprint}:${expectedFingerprint}`,
        }
      )
    )
  } else {
    metrics.push(
      metric(
        "request_fingerprint",
        false,
        "Transit request could not be reconstructed from its endpoints"
      )
    )
  }
  return capabilityReport("F2-transit", testCase.id, metrics)
}

export function validateWriteProtocolCapability(
  caseId: string,
  events: readonly EvalTraceEvent[]
): EvalCapabilityReport {
  const integrity = verifyEvalTrace(events)
  const metrics: EvalMetricResult[] = [
    metric(
      "trace_integrity",
      integrity.valid,
      integrity.valid
        ? "Eval trace sequence, hashes, and lifecycle spans are complete"
        : integrity.issues.join("; ")
    ),
  ]
  const dispatched = events.filter(
    (event) => event.type === "command.dispatched"
  )
  const terminalBySpan = new Map(
    events
      .filter(
        (event) =>
          event.type === "command.applied" || event.type === "command.rejected"
      )
      .map((event) => [event.spanId, event])
  )
  metrics.push(
    metric(
      "command_terminal_state",
      dispatched.length > 0 &&
        dispatched.every((event) => terminalBySpan.has(event.spanId)),
      "Every dispatched command reaches applied or rejected"
    )
  )
  const applied = events.filter((event) => event.type === "command.applied")
  metrics.push(
    metric(
      "revision_monotonic",
      applied.every(
        (event) =>
          event.revisionBefore != null &&
          event.revisionAfter != null &&
          event.revisionAfter >= event.revisionBefore
      ),
      "Applied commands never move the authoritative revision backwards"
    )
  )
  const rejected = events.filter((event) => event.type === "command.rejected")
  metrics.push(
    metric(
      "rejected_without_revision",
      rejected.every((event) => event.revisionAfter == null),
      "Rejected commands do not claim a new authoritative revision"
    )
  )
  const evidenceIds = new Set(
    events
      .filter((event) => event.type === "evidence.recorded")
      .map((event) => event.payload.evidenceId)
      .filter((value): value is string => typeof value === "string")
  )
  const referencedEvidence = events.flatMap((event) =>
    Array.isArray(event.payload.evidenceIds)
      ? event.payload.evidenceIds.filter(
          (value): value is string => typeof value === "string"
        )
      : []
  )
  metrics.push(
    metric(
      "evidence_references",
      referencedEvidence.every((evidenceId) => evidenceIds.has(evidenceId)),
      "Every referenced evidence id exists in the trace"
    )
  )
  return capabilityReport("F6-write-protocol", caseId, metrics)
}
