import { randomUUID } from "node:crypto"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HotelSearchService } from "@/modules/data/hotels/hotel-search-service"
import { prisma } from "@/modules/data/db/prisma"

describe.sequential("HotelSearchService provider resilience", () => {
  beforeEach(() => {
    vi.spyOn(prisma.providerRequestCache, "findUnique").mockResolvedValue(null)
    vi.spyOn(prisma.providerRequestCache, "upsert").mockResolvedValue(
      {} as never
    )
    vi.spyOn(prisma.providerUsageLog, "create").mockResolvedValue({} as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("retries transient failures and caches only the successful response", async () => {
    const suffix = randomUUID()
    const provider = {
      search: vi
        .fn()
        .mockResolvedValueOnce({
          candidates: [],
          warnings: [
            {
              provider: "rollinggo" as const,
              code: "timeout" as const,
              message: "temporary timeout",
              retryable: true,
            },
          ],
        })
        .mockResolvedValueOnce({
          candidates: [],
          warnings: [
            {
              provider: "rollinggo" as const,
              code: "rate_limited" as const,
              message: "temporary rate limit",
              retryable: true,
            },
          ],
        })
        .mockResolvedValueOnce({
          candidates: [
            {
              candidateId: `rollinggo-${suffix}`,
              provider: "rollinggo" as const,
              providerHotelId: suffix,
              name: `重试酒店-${suffix}`,
              coordinates: { lat: 30.25, lng: 120.15 },
              fetchedAt: "2026-08-10T00:00:00.000Z",
            },
          ],
          warnings: [],
        }),
    }
    const sleep = vi.fn().mockResolvedValue(undefined)
    const service = new HotelSearchService(provider, {
      sleep,
      random: () => 0.5,
    })
    const input = {
      originQuery: `杭州酒店-${suffix}`,
      place: "杭州",
      placeType: "城市" as const,
    }

    await expect(
      service.searchHotels(input, {
        agentRunId: `hotel-run-${suffix}`,
        requestId: `hotel-request-${suffix}`,
      })
    ).resolves.toMatchObject({
      candidates: [{ providerHotelId: suffix }],
      warnings: [],
      providerAttempts: 3,
    })
    expect(provider.search).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenNthCalledWith(1, 200)
    expect(sleep).toHaveBeenNthCalledWith(2, 2_000)

    expect(prisma.providerRequestCache.upsert).toHaveBeenCalledOnce()
  })

  it("opens a run-level circuit after a hard quota failure", async () => {
    const suffix = randomUUID()
    const provider = {
      search: vi.fn().mockResolvedValue({
        candidates: [],
        warnings: [
          {
            provider: "rollinggo" as const,
            code: "quota_exceeded" as const,
            message: "hard quota exhausted",
            retryable: false,
          },
        ],
      }),
    }
    const service = new HotelSearchService(provider, { now: () => 1000 })
    const context = {
      agentRunId: `hotel-run-${suffix}`,
      requestId: `hotel-request-${suffix}`,
    }
    const input = {
      originQuery: `西安酒店-${suffix}`,
      place: "西安",
      placeType: "城市" as const,
    }

    await expect(service.searchHotels(input, context)).resolves.toMatchObject({
      warnings: [expect.objectContaining({ attempts: 1, exhausted: true })],
    })
    await expect(
      service.searchHotels(input, {
        ...context,
        requestId: `hotel-request-second-${suffix}`,
      })
    ).resolves.toMatchObject({
      warnings: [expect.objectContaining({ attempts: 0, exhausted: true })],
    })
    expect(provider.search).toHaveBeenCalledOnce()
  })
})
