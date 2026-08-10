import { createHash } from "node:crypto"
import type { HotelSearchInput, HotelSearchResponse } from "@/lib/hotels/types"
import { prisma } from "@/modules/data/db/prisma"
import { RollingGoHotelProvider } from "./providers/rollinggo-hotel-provider"
import { queryWithRetry } from "../providers/query-retry"

export interface HotelProviderUsageContext {
  userId?: string
  workspaceId?: string
  agentRunId?: string
  requestId?: string
  signal?: AbortSignal
}

export interface HotelSearchProvider {
  search(
    input: HotelSearchInput,
    signal?: AbortSignal
  ): Promise<HotelSearchResponse>
}

const CACHE_TTL_MS = 5 * 60 * 1_000
const PROVIDER_CIRCUIT_TTL_MS = 2 * 60 * 1_000

interface HotelServiceRetryOptions {
  sleep?: (milliseconds: number) => Promise<void>
  random?: () => number
  now?: () => number
}

function cacheKey(input: HotelSearchInput) {
  return `rollinggo-hotel:${createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")}`
}

export class HotelSearchService {
  private readonly providerCircuitUntil = new Map<string, number>()

  private openProviderCircuit(circuitKey: string, until: number) {
    this.providerCircuitUntil.set(circuitKey, until)
    const cleanup = setTimeout(() => {
      if (this.providerCircuitUntil.get(circuitKey) === until) {
        this.providerCircuitUntil.delete(circuitKey)
      }
    }, PROVIDER_CIRCUIT_TTL_MS)
    cleanup.unref?.()
  }

  constructor(
    private readonly provider: HotelSearchProvider = new RollingGoHotelProvider(),
    private readonly retry: HotelServiceRetryOptions = {}
  ) {}

  async searchHotels(
    input: HotelSearchInput,
    context?: HotelProviderUsageContext
  ): Promise<HotelSearchResponse> {
    const key = cacheKey(input)
    const cached = await prisma.providerRequestCache.findUnique({
      where: { cacheKey: key },
    })
    if (cached?.expiresAt && cached.expiresAt > new Date()) {
      return {
        ...(JSON.parse(cached.responseJson) as HotelSearchResponse),
        providerAttempts: 0,
      }
    }

    const circuitKey = context?.agentRunId
    const now = this.retry.now?.() ?? Date.now()
    const circuitUntil = circuitKey
      ? this.providerCircuitUntil.get(circuitKey)
      : undefined
    if (circuitKey && circuitUntil && circuitUntil <= now) {
      this.providerCircuitUntil.delete(circuitKey)
    }
    const retried =
      circuitUntil && circuitUntil > now
        ? {
            result: {
              candidates: [],
              warnings: [
                {
                  provider: "rollinggo" as const,
                  code: "quota_exceeded" as const,
                  message: "当前 Agent run 的酒店查询已因硬额度错误停止",
                  retryable: false,
                  attempts: 0,
                  exhausted: true,
                },
              ],
            },
            attempts: 0,
            exhausted: true,
          }
        : await queryWithRetry({
            operation: () => this.provider.search(input, context?.signal),
            failure: (result) => {
              const warning = result.warnings[0]
              return warning
                ? {
                    retryable:
                      warning.retryable === true &&
                      context?.signal?.aborted !== true,
                    rateLimited: warning.code === "rate_limited",
                  }
                : undefined
            },
            sleep: this.retry.sleep,
            random: this.retry.random,
            signal: context?.signal,
          })
    const failure = retried.result.warnings[0]
    const result: HotelSearchResponse = {
      ...retried.result,
      providerAttempts: retried.attempts,
      warnings: retried.result.warnings.map((warning) =>
        warning === failure
          ? {
              ...warning,
              attempts: retried.attempts,
              exhausted: retried.exhausted,
            }
          : warning
      ),
    }
    const providerFailure = result.warnings[0]
    if (
      circuitKey &&
      providerFailure?.exhausted &&
      providerFailure.retryable === false &&
      providerFailure.code === "quota_exceeded"
    ) {
      this.openProviderCircuit(circuitKey, now + PROVIDER_CIRCUIT_TTL_MS)
    }
    await prisma.providerUsageLog.create({
      data: {
        provider: "rollinggo",
        purpose: "hotel_search",
        status: providerFailure ? "error" : "success",
        code: providerFailure?.code,
        userId: context?.userId,
        workspaceId: context?.workspaceId,
        agentRunId: context?.agentRunId,
        requestId: context?.requestId,
      },
    })
    if (!providerFailure) {
      const expiresAt = new Date(Date.now() + CACHE_TTL_MS)
      await prisma.providerRequestCache.upsert({
        where: { cacheKey: key },
        create: {
          provider: "rollinggo",
          cacheKey: key,
          responseJson: JSON.stringify(result),
          expiresAt,
        },
        update: { responseJson: JSON.stringify(result), expiresAt },
      })
    }
    return result
  }
}

export function createHotelSearchService() {
  return new HotelSearchService()
}
