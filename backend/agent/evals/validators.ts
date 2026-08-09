import type { PlaceResolveResult, PlaceSearchResult } from "@/lib/places/types"
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
import { evalContentHash, verifyEvalTrace } from "./trace"

type PlaceCapabilityResult = PlaceResolveResult

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
  traceEvents?: readonly EvalTraceEvent[]
}

export interface TransitCapabilityCase {
  id: string
  graph: TargetJourneyGraphSnapshot
  transitEventId: string
  expectedSelectedPlanId?: string
  expectedRequestFingerprint?: string
  maxEndpointErrorMeters?: number
  maxSegmentGapMeters?: number
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
  return result.status === "resolved" ? result.place : null
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

function selectedGeometryDistanceMeters(
  segments: readonly { positions: readonly [number, number][] }[]
) {
  let total = 0
  let previous: [number, number] | undefined
  for (const segment of segments) {
    for (const position of segment.positions) {
      if (previous) {
        total += distanceMeters(
          { lng: previous[0], lat: previous[1] },
          { lng: position[0], lat: position[1] }
        )
      }
      previous = position
    }
  }
  return total
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

  if (testCase.expectation.requireEvidence) {
    const integrity = verifyEvalTrace(testCase.traceEvents ?? [])
    const matchingEvidence = (testCase.traceEvents ?? []).filter(
      (event) =>
        event.type === "evidence.recorded" &&
        event.payload.evidenceId === testCase.evidenceId
    )
    const evidence = matchingEvidence[0]
    metrics.push(
      metric(
        "evidence_trace_integrity",
        integrity.valid,
        integrity.valid
          ? "Place evidence belongs to a complete Eval Trace"
          : integrity.issues.join("; ")
      ),
      metric(
        "evidence_reference",
        Boolean(testCase.evidenceId?.trim()) &&
          matchingEvidence.length === 1 &&
          evidence?.payload.contentHash === evalContentHash(testCase.result) &&
          typeof evidence.payload.toolType === "string" &&
          evidence.payload.toolType === "place.resolve" &&
          evidence.payload.resultStatus === testCase.result.status,
        "Place decision is bound to one recorded evidence event with the exact result hash"
      )
    )
  }

  const place = resolvedPlace(testCase.result)
  if (!place) {
    if (testCase.expectation.status === "resolved") {
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
  metrics.push(
    metric(
      "planning_identity",
      Boolean(
        run &&
        selectedPlan &&
        run.transitEventId === event.id &&
        selectedPlan.planningRunId === run.id &&
        selectedPlan.transitEventId === event.id
      ),
      "Planning run and selected plan retain the Transit Event identity"
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

  const orderedSegments = selectedPlan
    ? [...selectedPlan.segments].sort((left, right) => left.order - right.order)
    : []
  const segmentOrderIsContiguous = orderedSegments.every(
    (segment, index) => segment.order === index
  )
  const segmentIdsAreUnique =
    new Set(orderedSegments.map((segment) => segment.id)).size ===
    orderedSegments.length
  metrics.push(
    metric(
      "segment_order",
      orderedSegments.length > 0 &&
        segmentOrderIsContiguous &&
        segmentIdsAreUnique,
      "Selected plan segments have a unique contiguous execution order"
    )
  )

  const request = buildTransitPlanRequest(event, graph.events)
  const endpointTolerance = testCase.maxEndpointErrorMeters ?? 250
  const segmentGapTolerance = testCase.maxSegmentGapMeters ?? 250
  const firstPosition = orderedSegments[0]?.positions[0]
  const lastSegment = orderedSegments.at(-1)
  const lastPosition = lastSegment?.positions.at(-1)
  const geometryCoordinateSystemMatches = Boolean(
    request &&
    request.origin.coordinateSystem &&
    request.destination.coordinateSystem &&
    request.origin.coordinateSystem === request.destination.coordinateSystem &&
    orderedSegments.every(
      (segment) => segment.coordinateSystem === request.origin.coordinateSystem
    )
  )
  metrics.push(
    metric(
      "geometry_coordinate_system",
      geometryCoordinateSystemMatches,
      "Selected geometry uses the same coordinate system as both request endpoints"
    )
  )
  const endpointGeometryMatches = Boolean(
    request &&
    firstPosition &&
    lastPosition &&
    distanceMeters(request.origin, {
      lng: firstPosition[0],
      lat: firstPosition[1],
    }) <= endpointTolerance &&
    distanceMeters(request.destination, {
      lng: lastPosition[0],
      lat: lastPosition[1],
    }) <= endpointTolerance
  )
  metrics.push(
    metric(
      "geometry_endpoints",
      endpointGeometryMatches,
      "Selected geometry starts and ends within tolerance of the current request endpoints"
    )
  )
  const geometryIsContinuous = orderedSegments.every((segment, index) => {
    if (index === 0) return true
    const previous = orderedSegments[index - 1]
    const previousEnd = previous?.positions.at(-1)
    const currentStart = segment.positions[0]
    if (!previousEnd || !currentStart) return false
    return (
      distanceMeters(
        { lng: previousEnd[0], lat: previousEnd[1] },
        { lng: currentStart[0], lat: currentStart[1] }
      ) <= segmentGapTolerance
    )
  })
  metrics.push(
    metric(
      "geometry_continuity",
      orderedSegments.length > 0 && geometryIsContinuous,
      "Selected plan segment geometries are continuous in execution order"
    )
  )

  const geometryDistance = selectedGeometryDistanceMeters(orderedSegments)
  const directEndpointDistance = request
    ? distanceMeters(request.origin, request.destination)
    : 0
  const geometryAggregateValid = Boolean(
    selectedPlan &&
    geometryDistance > 0 &&
    selectedPlan.distanceMeters >= directEndpointDistance * 0.9 &&
    selectedPlan.distanceMeters >= geometryDistance * 0.75 &&
    selectedPlan.distanceMeters <= geometryDistance * 4
  )
  metrics.push(
    metric(
      "geometry_distance_aggregate",
      geometryAggregateValid,
      "Selected plan distance is plausible for its endpoints and recorded geometry"
    )
  )

  const distances = orderedSegments.map((segment) => segment.distanceMeters)
  const durations = orderedSegments.map((segment) => segment.durationSeconds)
  const planDurationValid = Boolean(
    selectedPlan &&
    (selectedPlan.distanceMeters === 0
      ? selectedPlan.durationSeconds >= 0
      : selectedPlan.durationSeconds > 0 &&
        selectedPlan.durationSeconds >= selectedPlan.distanceMeters / 120)
  )
  metrics.push(
    metric(
      "plan_duration",
      planDurationValid,
      "A non-zero route has a positive duration above the physical lower bound"
    )
  )
  const distanceAggregateValid =
    distances.every((value) => value == null) ||
    (distances.every((value): value is number => value != null) &&
      Math.abs(
        distances.reduce((total, value) => total + value, 0) -
          (selectedPlan?.distanceMeters ?? 0)
      ) <= 1)
  const durationAggregateValid =
    planDurationValid &&
    (durations.every((value) => value == null) ||
      (durations.every((value): value is number => value != null) &&
        Math.abs(
          durations.reduce((total, value) => total + value, 0) -
            (selectedPlan?.durationSeconds ?? 0)
        ) <= 1))
  metrics.push(
    metric(
      "plan_aggregates",
      Boolean(selectedPlan) && distanceAggregateValid && durationAggregateValid,
      "Selected plan distance and duration agree with complete segment aggregates"
    )
  )

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
  const revisionFloorByScope = new Map<string, number>()
  let revisionContinuity = true
  for (const event of applied) {
    if (event.revisionBefore == null || event.revisionAfter == null) {
      revisionContinuity = false
      continue
    }
    if (event.payload.replayedFromIdempotencyKey === true) continue
    const scope = event.workspaceId ?? "__run__"
    const revisionFloor = revisionFloorByScope.get(scope)
    if (revisionFloor != null && event.revisionBefore !== revisionFloor) {
      revisionContinuity = false
    }
    if (event.revisionAfter < event.revisionBefore) {
      revisionContinuity = false
    }
    revisionFloorByScope.set(scope, event.revisionAfter)
  }
  metrics.push(
    metric(
      "revision_monotonic",
      revisionContinuity,
      "Non-replay applied commands follow the run/workspace authoritative revision floor"
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
