import { createHash } from "node:crypto"
import type { HotelSearchInput, HotelSearchResponse } from "@/lib/hotels/types"
import { prisma } from "@/modules/data/db/prisma"
import { RollingGoHotelProvider } from "./providers/rollinggo-hotel-provider"

export interface HotelProviderUsageContext {
  userId?: string
  workspaceId?: string
  agentRunId?: string
  requestId?: string
}

export interface HotelSearchProvider {
  search(input: HotelSearchInput): Promise<HotelSearchResponse>
}

const CACHE_TTL_MS = 5 * 60 * 1_000

function cacheKey(input: HotelSearchInput) {
  return `rollinggo-hotel:${createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")}`
}

export class HotelSearchService {
  constructor(
    private readonly provider: HotelSearchProvider = new RollingGoHotelProvider()
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
      return JSON.parse(cached.responseJson) as HotelSearchResponse
    }

    const result = await this.provider.search(input)
    const providerFailure = result.warnings[0]
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
