import { prisma } from "@/modules/data/db/prisma"
import type {
  RoutePlanBundle,
  RoutePlanFailure,
  RoutePlanRequest,
} from "@/lib/routes/planning"
import {
  AMapRouteProvider,
  RouteProviderError,
} from "./providers/amap-route-provider"

export interface RoutePlanProvider {
  plan(request: RoutePlanRequest): Promise<RoutePlanBundle>
}

export interface RoutePlanBatchResult {
  bundles: RoutePlanBundle[]
  failures: RoutePlanFailure[]
}

interface PlanningServiceOptions {
  provider?: RoutePlanProvider
  sleep?: (milliseconds: number) => Promise<void>
  logUsage?: (status: string, code?: string) => Promise<void>
}

const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 150
const RATE_LIMIT_RETRY_BASE_DELAY_MS = 1_000

export class RoutePlanningService {
  private readonly provider: RoutePlanProvider
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly logUsage: (status: string, code?: string) => Promise<void>
  private readonly inFlight = new Map<string, Promise<RoutePlanBundle>>()
  private queue: Promise<unknown> = Promise.resolve()

  constructor(options: PlanningServiceOptions = {}) {
    this.provider = options.provider ?? new AMapRouteProvider()
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)))
    this.logUsage = options.logUsage ?? logProviderUsage
  }

  plan(request: RoutePlanRequest) {
    const dedupeKey = JSON.stringify({ ...request, edgeId: undefined })
    const existing = this.inFlight.get(dedupeKey)
    if (existing) {
      return existing.then((bundle) => rekeyBundle(bundle, request.edgeId))
    }

    const pending = this.enqueue(() => this.planWithRetry(request)).finally(
      () => {
        this.inFlight.delete(dedupeKey)
      }
    )
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

  async planMany(requests: RoutePlanRequest[]): Promise<RoutePlanBatchResult> {
    const bundles: RoutePlanBundle[] = []
    const failures: RoutePlanFailure[] = []
    for (const [index, request] of requests.entries()) {
      try {
        bundles.push(await this.plan(request))
      } catch (error) {
        const failure = normalizeFailure(request.edgeId, error)
        failures.push(failure)
        if (failure.code === "AUTH_OR_QUOTA") {
          failures.push(
            ...requests.slice(index + 1).map((pending) => ({
              ...failure,
              edgeId: pending.edgeId,
            }))
          )
          break
        }
      }
    }
    return { bundles, failures }
  }

  private async planWithRetry(request: RoutePlanRequest) {
    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const result = await this.provider.plan(request)
        await this.logUsage("success")
        return result
      } catch (error) {
        lastError = error
        const retryable =
          error instanceof RouteProviderError &&
          (error.code === "RATE_LIMIT" || error.code === "TIMEOUT")
        if (!retryable || attempt === MAX_ATTEMPTS) {
          await this.logUsage(
            "error",
            error instanceof RouteProviderError ? error.code : "UNKNOWN"
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

export const routePlanningService = new RoutePlanningService()

function rekeyBundle(bundle: RoutePlanBundle, edgeId: string): RoutePlanBundle {
  if (bundle.edgeId === edgeId) return bundle
  return {
    ...bundle,
    edgeId,
    plans: bundle.plans.map((plan, planIndex) => ({
      ...plan,
      id: `${edgeId}-${bundle.requestFingerprint}-${planIndex}`,
      segments: plan.segments.map((segment, segmentIndex) => ({
        ...segment,
        id: `${edgeId}-${bundle.requestFingerprint}-${planIndex}-${segmentIndex}`,
      })),
    })),
  }
}

function normalizeFailure(edgeId: string, error: unknown): RoutePlanFailure {
  if (error instanceof RouteProviderError) {
    return { edgeId, code: error.code, message: error.message }
  }
  return {
    edgeId,
    code: "MALFORMED_RESPONSE",
    message: error instanceof Error ? error.message : "路线规划失败",
  }
}

async function logProviderUsage(status: string, code?: string) {
  await prisma.providerUsageLog.create({
    data: { provider: "amap", purpose: "route_plan", status, code },
  })
}
