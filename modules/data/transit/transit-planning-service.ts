import { prisma } from "@/modules/data/db/prisma"
import type {
  TransitPlanBundle,
  TransitPlanFailure,
  TransitPlanRequest,
} from "@/lib/journeys/planning"
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

interface PlanningServiceOptions {
  provider?: TransitPlanProvider
  sleep?: (milliseconds: number) => Promise<void>
  logUsage?: (status: string, code?: string) => Promise<void>
}

const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 150
const RATE_LIMIT_RETRY_BASE_DELAY_MS = 1_000

export class TransitPlanningService {
  private readonly provider: TransitPlanProvider
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly logUsage: (status: string, code?: string) => Promise<void>
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

  plan(request: TransitPlanRequest) {
    const dedupeKey = JSON.stringify({
      ...request,
      transitEventId: undefined,
    })
    const existing = this.inFlight.get(dedupeKey)
    if (existing) {
      return existing.then((bundle) =>
        rekeyBundle(bundle, request.transitEventId)
      )
    }

    const pending = this.enqueue(() => this.planWithRetry(request))
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

  private async planWithRetry(request: TransitPlanRequest) {
    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const result = await this.provider.plan(request)
        await this.logUsage("success")
        return result
      } catch (error) {
        lastError = error
        const retryable =
          error instanceof TransitProviderError &&
          (error.code === "RATE_LIMIT" || error.code === "TIMEOUT")
        if (!retryable || attempt === MAX_ATTEMPTS) {
          await this.logUsage(
            "error",
            error instanceof TransitProviderError ? error.code : "UNKNOWN"
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

async function logProviderUsage(status: string, code?: string) {
  await prisma.providerUsageLog.create({
    data: { provider: "amap", purpose: "transit_plan", status, code },
  })
}
