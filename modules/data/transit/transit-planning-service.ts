import { prisma } from "@/modules/data/db/prisma"
import {
  transitPlanFingerprint,
  type TransitPlanBundle,
  type TransitPlanFailure,
  type TransitPlanRequest,
} from "@/lib/journeys/planning"
import type { AuthContext } from "@/modules/auth/server/context"
import {
  targetTransitPlanningRunSchema,
  type TargetTransitPlanningRun,
} from "@/modules/data-model/contracts"
import { getJourneyRevisionByIdempotencyKey } from "@/modules/data/journeys/journey-repository"
import {
  commitTransitPlanningRun,
  TransitInputError,
  transitRunId,
} from "./transit-repository"
import {
  AMapTransitProvider,
  TransitProviderError,
} from "./providers/amap-transit-provider"

export interface TransitPlanProvider {
  plan(request: TransitPlanRequest): Promise<TransitPlanBundle>
}

export interface TransitPlanBatchResult {
  bundles: TransitPlanBundle[]
  failures: TransitPlanFailure[]
}

export interface TransitPlanUsageContext {
  userId?: string
  workspaceId?: string
  agentRunId?: string
  requestId?: string
}

export type PersistedTransitPlanningResult =
  | {
      status: "READY"
      run: TargetTransitPlanningRun
      graph: NonNullable<Awaited<ReturnType<typeof commitTransitPlanningRun>>>
    }
  | {
      status: "FAILED"
      run: TargetTransitPlanningRun
      failure: TransitPlanFailure
      graph: NonNullable<Awaited<ReturnType<typeof commitTransitPlanningRun>>>
    }

interface PlanningServiceOptions {
  provider?: TransitPlanProvider
  sleep?: (milliseconds: number) => Promise<void>
  logUsage?: (
    status: string,
    code?: string,
    context?: TransitPlanUsageContext
  ) => Promise<void>
}

const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 150
const RATE_LIMIT_RETRY_BASE_DELAY_MS = 1_000

export class TransitPlanningService {
  private readonly provider: TransitPlanProvider
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly logUsage: (
    status: string,
    code?: string,
    context?: TransitPlanUsageContext
  ) => Promise<void>
  private readonly inFlight = new Map<string, Promise<TransitPlanBundle>>()
  private queue: Promise<unknown> = Promise.resolve()

  constructor(options: PlanningServiceOptions = {}) {
    this.provider = options.provider ?? new AMapTransitProvider()
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)))
    this.logUsage = options.logUsage ?? logProviderUsage
  }

  plan(request: TransitPlanRequest, usageContext?: TransitPlanUsageContext) {
    const dedupeKey = JSON.stringify({
      ...request,
      transitEventId: undefined,
      usageContext: {
        userId: usageContext?.userId,
        workspaceId: usageContext?.workspaceId,
        agentRunId: usageContext?.agentRunId,
        requestId: usageContext?.requestId,
      },
    })
    const existing = this.inFlight.get(dedupeKey)
    if (existing) {
      return existing.then((bundle) =>
        rekeyBundle(bundle, request.transitEventId)
      )
    }

    const pending = this.enqueue(() =>
      this.planWithRetry(request, usageContext)
    )
      .then((bundle) => rekeyBundle(bundle, request.transitEventId))
      .finally(() => {
        this.inFlight.delete(dedupeKey)
      })
    this.inFlight.set(dedupeKey, pending)
    return pending
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation)
    this.queue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  async planMany(
    requests: TransitPlanRequest[]
  ): Promise<TransitPlanBatchResult> {
    const bundles: TransitPlanBundle[] = []
    const failures: TransitPlanFailure[] = []
    for (const [index, request] of requests.entries()) {
      try {
        bundles.push(await this.plan(request))
      } catch (error) {
        const failure = normalizeFailure(request.transitEventId, error)
        failures.push(failure)
        if (failure.code === "AUTH_OR_QUOTA") {
          failures.push(
            ...requests.slice(index + 1).map((pending) => ({
              ...failure,
              transitEventId: pending.transitEventId,
            }))
          )
          break
        }
      }
    }
    return { bundles, failures }
  }

  async planAndPersist(
    context: AuthContext,
    journeyId: string,
    request: TransitPlanRequest,
    options: { expectedRevision: number; idempotencyKey: string }
  ): Promise<PersistedTransitPlanningResult> {
    const requestFingerprint = transitPlanFingerprint(request)
    const runId = transitRunId(
      journeyId,
      request.transitEventId,
      options.idempotencyKey
    )
    const replay = await getJourneyRevisionByIdempotencyKey(
      context,
      journeyId,
      options.idempotencyKey
    )
    if (replay) {
      const run = replay.snapshot.transitPlanningRuns.find(
        (candidate) => candidate.id === runId
      )
      if (
        !run ||
        replay.operation !== "journey.plan_transit" ||
        run.transitEventId !== request.transitEventId ||
        run.requestFingerprint !== requestFingerprint
      ) {
        throw new TransitInputError(
          "Transit planning idempotency key has another payload"
        )
      }
      if (run.status === "READY") {
        return { status: "READY", run, graph: replay.snapshot }
      }
      if (run.status === "FAILED") {
        return {
          status: "FAILED",
          run,
          failure: {
            transitEventId: run.transitEventId,
            code: transitFailureCode(run.errorCode),
            message: run.errorMessage ?? "路线规划失败",
          },
          graph: replay.snapshot,
        }
      }
      throw new TransitInputError(
        "Persisted Transit planning replay is not terminal"
      )
    }
    const calculatedAt = new Date().toISOString()

    let bundle: TransitPlanBundle
    try {
      bundle = await this.plan(request, {
        userId: context.userId,
        requestId: options.idempotencyKey,
      })
    } catch (error) {
      const failure = normalizeFailure(request.transitEventId, error)
      const run: TargetTransitPlanningRun = {
        id: runId,
        transitEventId: request.transitEventId,
        requestFingerprint,
        provider: "amap",
        status: "FAILED",
        errorCode: failure.code,
        errorMessage: failure.message,
        calculatedAt,
        plans: [],
      }
      const graph = await commitTransitPlanningRun(context, journeyId, {
        run,
        expectedRevision: options.expectedRevision,
        idempotencyKey: options.idempotencyKey,
      })
      if (!graph) throw new Error("Journey not found")
      return { status: "FAILED", run, failure, graph }
    }

    if (bundle.transitEventId !== request.transitEventId) {
      throw new TransitInputError(
        "Transit provider returned a bundle for another Transit Event"
      )
    }
    const run = planningRunFromBundle(
      runId,
      bundle,
      calculatedAt,
      requestFingerprint
    )
    const graph = await commitTransitPlanningRun(context, journeyId, {
      run,
      expectedRevision: options.expectedRevision,
      idempotencyKey: options.idempotencyKey,
    })
    if (!graph) throw new Error("Journey not found")
    return { status: "READY", run, graph }
  }

  private async planWithRetry(
    request: TransitPlanRequest,
    usageContext?: TransitPlanUsageContext
  ) {
    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const result = await this.provider.plan(request)
        validateProviderBundle(request, result)
        await this.logUsage("success", undefined, usageContext)
        return result
      } catch (error) {
        lastError = error
        const retryable =
          error instanceof TransitProviderError &&
          (error.code === "RATE_LIMIT" || error.code === "TIMEOUT")
        if (!retryable || attempt === MAX_ATTEMPTS) {
          await this.logUsage(
            "error",
            error instanceof TransitProviderError ? error.code : "UNKNOWN",
            usageContext
          )
          throw error
        }
        const baseDelay =
          error.code === "RATE_LIMIT"
            ? RATE_LIMIT_RETRY_BASE_DELAY_MS
            : RETRY_BASE_DELAY_MS
        await this.sleep(baseDelay * 2 ** (attempt - 1))
      }
    }
    throw lastError
  }
}

export const transitPlanningService = new TransitPlanningService()

function validateProviderBundle(
  request: TransitPlanRequest,
  bundle: TransitPlanBundle
) {
  try {
    const requestFingerprint = transitPlanFingerprint(request)
    if (
      bundle.transitEventId !== request.transitEventId ||
      bundle.requestFingerprint !== requestFingerprint
    ) {
      throw new Error(
        "Transit provider returned a stale or mismatched response"
      )
    }
    if (
      bundle.plans.some(
        (plan) => plan.requestFingerprint !== requestFingerprint
      )
    ) {
      throw new Error(
        "Transit provider returned a plan for another request fingerprint"
      )
    }
    targetTransitPlanningRunSchema.parse(
      planningRunFromBundle(
        "provider-validation-run",
        bundle,
        "1970-01-01T00:00:00.000Z",
        requestFingerprint
      )
    )
  } catch (error) {
    throw new TransitProviderError(
      "MALFORMED_RESPONSE",
      error instanceof Error
        ? error.message
        : "Transit provider returned a malformed response"
    )
  }
}

function rekeyBundle(
  bundle: TransitPlanBundle,
  transitEventId: string
): TransitPlanBundle {
  return {
    ...bundle,
    transitEventId,
    plans: bundle.plans.map((plan, planIndex) => ({
      ...plan,
      id: `${transitEventId}-${bundle.requestFingerprint}-${planIndex}`,
      segments: plan.segments.map((segment, segmentIndex) => ({
        ...segment,
        id: `${transitEventId}-${bundle.requestFingerprint}-${planIndex}-${segmentIndex}`,
      })),
    })),
  }
}

function normalizeFailure(
  transitEventId: string,
  error: unknown
): TransitPlanFailure {
  if (error instanceof TransitProviderError) {
    return { transitEventId, code: error.code, message: error.message }
  }
  return {
    transitEventId,
    code: "MALFORMED_RESPONSE",
    message: error instanceof Error ? error.message : "路线规划失败",
  }
}

function transitFailureCode(
  value: string | undefined
): TransitPlanFailure["code"] {
  return value === "INVALID_ENDPOINT" ||
    value === "NO_ROUTE" ||
    value === "AUTH_OR_QUOTA" ||
    value === "RATE_LIMIT" ||
    value === "TIMEOUT" ||
    value === "MALFORMED_RESPONSE"
    ? value
    : "MALFORMED_RESPONSE"
}

function planningRunFromBundle(
  runId: string,
  bundle: TransitPlanBundle,
  calculatedAt: string,
  requestFingerprint: string
): TargetTransitPlanningRun {
  return {
    id: runId,
    transitEventId: bundle.transitEventId,
    requestFingerprint,
    provider: bundle.plans[0]?.provider ?? "amap",
    status: "READY",
    warning: bundle.warning,
    calculatedAt,
    plans: bundle.plans.map((plan, planIndex) => ({
      id: `${runId}-plan-${planIndex}`,
      planningRunId: runId,
      transitEventId: bundle.transitEventId,
      provider: plan.provider,
      rank: plan.rank,
      label: plan.label,
      strategy: plan.strategy,
      distanceMeters: plan.distanceMeters,
      durationSeconds: plan.durationSeconds,
      fareAmount: plan.fareAmount,
      trafficBasis: plan.trafficBasis,
      calculatedAt: plan.calculatedAt,
      validUntil: plan.validUntil,
      segments: plan.segments.map((segment, segmentIndex) => ({
        id: `${runId}-plan-${planIndex}-segment-${segmentIndex}`,
        order: segment.order,
        mode: segment.mode,
        fromName: segment.fromName,
        toName: segment.toName,
        lineName: segment.lineName,
        distanceMeters: segment.distanceMeters,
        durationSeconds: segment.durationSeconds,
        fareAmount: segment.fareAmount,
        departAt: segment.departAt,
        arriveAt: segment.arriveAt,
        coordinateSystem: segment.coordinateSystem,
        geometryKind: segment.geometryKind,
        positions: segment.positions,
        trafficSections: segment.trafficSections,
      })),
    })),
  }
}

async function logProviderUsage(
  status: string,
  code?: string,
  context?: TransitPlanUsageContext
) {
  await prisma.providerUsageLog.create({
    data: {
      provider: "amap",
      purpose: "transit_plan",
      status,
      code,
      userId: context?.userId,
      workspaceId: context?.workspaceId,
      agentRunId: context?.agentRunId,
      requestId: context?.requestId,
    },
  })
}
