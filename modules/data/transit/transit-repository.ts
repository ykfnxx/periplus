import { createHash } from "node:crypto"
import type { AuthContext } from "@/modules/auth/server/context"
import {
  targetTransitPlanningRunSchema,
  type TargetJourneyGraphSnapshot,
  type TargetTransitPlanningRun,
} from "@/modules/data-model/contracts"
import {
  commitJourneyDomainGraph,
  getJourney,
  getJourneyRevisionByIdempotencyKey,
  JourneyInputError,
  JourneyRevisionConflictError,
} from "@/modules/data/journeys/journey-repository"

export class TransitInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TransitInputError"
  }
}

function stableId(prefix: string, ...parts: string[]) {
  const digest = createHash("sha256").update(parts.join("\0")).digest("hex")
  return `${prefix}-${digest.slice(0, 32)}`
}

function sameJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function writeEnvelope(
  context: AuthContext,
  graph: TargetJourneyGraphSnapshot,
  operation: string,
  idempotencyKey: string,
  patch: unknown[],
  inversePatch: unknown[]
) {
  return {
    graph,
    operation,
    idempotencyKey,
    patch,
    inversePatch,
    actor: { kind: "USER" as const, userId: context.userId },
  }
}

function transitEvent(graph: TargetJourneyGraphSnapshot, eventId: string) {
  const event = graph.events.find((candidate) => candidate.id === eventId)
  if (!event || event.type !== "TRANSIT" || event.retiredRevision) {
    throw new TransitInputError(`active Transit Event ${eventId} not found`)
  }
  return event
}

export function transitRunId(
  journeyId: string,
  transitEventId: string,
  idempotencyKey: string
) {
  return stableId("transit-run", journeyId, transitEventId, idempotencyKey)
}

export async function commitTransitPlanningRun(
  context: AuthContext,
  journeyId: string,
  input: {
    run: TargetTransitPlanningRun
    expectedRevision: number
    idempotencyKey: string
    selectedPlanId?: string
  }
) {
  const run = targetTransitPlanningRunSchema.parse(input.run)
  const requestedSelectedPlanId =
    run.status === "READY"
      ? (input.selectedPlanId ?? run.plans[0]?.id)
      : undefined
  if (run.status !== "READY" && input.selectedPlanId) {
    throw new TransitInputError(
      "Only a READY TransitPlanningRun can select a plan"
    )
  }
  const replay = await getJourneyRevisionByIdempotencyKey(
    context,
    journeyId,
    input.idempotencyKey
  )
  if (replay) {
    const persisted = replay.snapshot.transitPlanningRuns.find(
      (candidate) => candidate.id === run.id
    )
    const event = replay.snapshot.events.find(
      (candidate) => candidate.id === run.transitEventId
    )
    if (
      replay.operation !== "journey.plan_transit" ||
      !sameJson(persisted, run) ||
      (run.status === "READY" &&
        (event?.type !== "TRANSIT" ||
          event.detail.activePlanningRunId !== run.id ||
          event.detail.selectedPlanId !== requestedSelectedPlanId))
    ) {
      throw new TransitInputError(
        "Transit planning idempotency key has another payload"
      )
    }
    return replay.snapshot
  }
  const current = await getJourney(context, journeyId)
  if (!current) return null

  const existing = current.transitPlanningRuns.find(
    (candidate) => candidate.id === run.id
  )
  if (existing) {
    if (!sameJson(existing, run)) {
      throw new TransitInputError(
        `TransitPlanningRun ${run.id} already exists with another payload`
      )
    }
    return current
  }
  if (current.revision !== input.expectedRevision) {
    throw new JourneyRevisionConflictError()
  }
  if (run.transitEventId !== transitEvent(current, run.transitEventId).id) {
    throw new TransitInputError("planning run Transit Event is invalid")
  }

  const selectedPlanId = requestedSelectedPlanId
  if (selectedPlanId && !run.plans.some((plan) => plan.id === selectedPlanId)) {
    throw new TransitInputError(
      `selected TransitPlan ${selectedPlanId} does not belong to run ${run.id}`
    )
  }

  const next = structuredClone(current)
  next.revision += 1
  next.transitPlanningRuns.push(run)
  const event = transitEvent(next, run.transitEventId)
  const beforeSelection = {
    activePlanningRunId: event.detail.activePlanningRunId,
    selectedPlanId: event.detail.selectedPlanId,
    routeState: event.detail.routeState,
  }
  if (run.status === "READY") {
    event.detail.activePlanningRunId = run.id
    event.detail.selectedPlanId = selectedPlanId
    event.detail.routeState = "READY"
  } else if (
    run.status === "FAILED" &&
    event.detail.activePlanningRunId &&
    event.detail.selectedPlanId
  ) {
    event.detail.routeState = "ROUTE_STALE"
  }
  const afterSelection = {
    activePlanningRunId: event.detail.activePlanningRunId,
    selectedPlanId: event.detail.selectedPlanId,
    routeState: event.detail.routeState,
  }
  const selectionChanged = !sameJson(beforeSelection, afterSelection)

  try {
    return await commitJourneyDomainGraph(
      context,
      journeyId,
      writeEnvelope(
        context,
        next,
        "journey.plan_transit",
        input.idempotencyKey,
        [
          {
            op: "add",
            path: "/transitPlanningRuns/-",
            value: run,
          },
          ...(selectionChanged
            ? [
                {
                  op: "replace",
                  path: `/events/${run.transitEventId}/detail/routeSelection`,
                  value: afterSelection,
                },
              ]
            : []),
        ],
        [
          {
            op: "remove",
            path: `/transitPlanningRuns/${run.id}`,
          },
          ...(selectionChanged
            ? [
                {
                  op: "replace",
                  path: `/events/${run.transitEventId}/detail/routeSelection`,
                  value: beforeSelection,
                },
              ]
            : []),
        ]
      ),
      input.expectedRevision,
      "TRANSIT"
    )
  } catch (error) {
    if (error instanceof JourneyInputError) {
      throw new TransitInputError(error.message)
    }
    throw error
  }
}

export async function selectTransitPlan(
  context: AuthContext,
  journeyId: string,
  input: {
    transitEventId: string
    planningRunId: string
    planId: string
    expectedRevision: number
    idempotencyKey: string
  }
) {
  const replay = await getJourneyRevisionByIdempotencyKey(
    context,
    journeyId,
    input.idempotencyKey
  )
  if (replay) {
    const event = replay.snapshot.events.find(
      (candidate) => candidate.id === input.transitEventId
    )
    if (
      replay.operation !== "journey.select_transit_plan" ||
      event?.type !== "TRANSIT" ||
      event.detail.activePlanningRunId !== input.planningRunId ||
      event.detail.selectedPlanId !== input.planId
    ) {
      throw new TransitInputError(
        "Transit selection idempotency key has another payload"
      )
    }
    return replay.snapshot
  }
  const current = await getJourney(context, journeyId)
  if (!current) return null
  if (current.revision !== input.expectedRevision) {
    throw new JourneyRevisionConflictError()
  }
  const run = current.transitPlanningRuns.find(
    (candidate) =>
      candidate.id === input.planningRunId &&
      candidate.transitEventId === input.transitEventId
  )
  if (!run || run.status !== "READY") {
    throw new TransitInputError("READY TransitPlanningRun not found")
  }
  if (!run.plans.some((plan) => plan.id === input.planId)) {
    throw new TransitInputError("TransitPlan does not belong to planning run")
  }

  const next = structuredClone(current)
  next.revision += 1
  const event = transitEvent(next, input.transitEventId)
  const before = {
    activePlanningRunId: event.detail.activePlanningRunId,
    selectedPlanId: event.detail.selectedPlanId,
    routeState: event.detail.routeState,
  }
  event.detail.activePlanningRunId = input.planningRunId
  event.detail.selectedPlanId = input.planId
  event.detail.routeState = "READY"

  return commitJourneyDomainGraph(
    context,
    journeyId,
    writeEnvelope(
      context,
      next,
      "journey.select_transit_plan",
      input.idempotencyKey,
      [
        {
          op: "replace",
          path: `/events/${input.transitEventId}/detail/routeSelection`,
          value: {
            activePlanningRunId: input.planningRunId,
            selectedPlanId: input.planId,
            routeState: "READY",
          },
        },
      ],
      [
        {
          op: "replace",
          path: `/events/${input.transitEventId}/detail/routeSelection`,
          value: before,
        },
      ]
    ),
    input.expectedRevision,
    "TRANSIT"
  )
}
