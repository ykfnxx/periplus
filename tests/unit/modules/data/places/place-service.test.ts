import { describe, expect, it, vi } from "vitest"
import { PlaceIntelligenceService } from "@/modules/data/places/place-service"
import type { PlaceCandidate } from "@/lib/places/types"

function catalogCandidate(): PlaceCandidate {
  return {
    candidateId: "place-palace",
    placeId: "palace",
    provider: "periplus",
    name: "故宫博物院",
    normalizedName: "故宫博物院",
    aliases: [],
    category: "SIGHT",
    province: "北京",
    city: "北京市",
    coordinates: [],
    sources: [
      { provider: "periplus", providerId: "palace", confidence: 0.95 },
      { provider: "mct", providerId: "mct-palace" },
    ],
    sourceConfidence: 0.95,
    fromLiveProvider: false,
  }
}

function amapCandidate(): PlaceCandidate {
  return {
    candidateId: "amap-palace",
    provider: "amap",
    providerId: "B000A8UIN8",
    name: "故宫博物院",
    normalizedName: "故宫博物院",
    aliases: [],
    category: "SIGHT",
    province: "北京市",
    city: "北京市",
    coordinates: [
      {
        provider: "amap",
        coordinateSystem: "GCJ02",
        lat: 39.916,
        lng: 116.397,
        accuracy: "provider_poi",
        source: "provider_search",
      },
    ],
    sources: [{ provider: "amap", providerId: "B000A8UIN8" }],
    sourceConfidence: 0.8,
    fromLiveProvider: true,
  }
}

function serviceFor(
  confidenceSource = catalogCandidate(),
  retry: ConstructorParameters<typeof PlaceIntelligenceService>[2] = {}
) {
  const repository = {
    findById: vi.fn().mockResolvedValue(confidenceSource),
    linkProviderMatch: vi.fn().mockResolvedValue(undefined),
    persistMatchReview: vi.fn().mockResolvedValue("review-1"),
  }
  const provider = {
    search: vi
      .fn()
      .mockResolvedValue({ candidates: [amapCandidate()], warnings: [] }),
  }
  return {
    service: new PlaceIntelligenceService(repository, provider, retry),
    repository,
    provider,
  }
}

describe("PlaceIntelligenceService", () => {
  it("writes back a clear provider match during enrichment", async () => {
    const { service, repository } = serviceFor()

    const result = await service.enrichPlace({ placeId: "palace" })

    expect(result.matchStatus).toBe("AUTO_APPROVED")
    expect(repository.linkProviderMatch).toHaveBeenCalledWith(
      "palace",
      expect.objectContaining({ name: "故宫博物院" })
    )
  })

  it("retries transient provider failures twice before returning a result", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const { service, provider } = serviceFor(catalogCandidate(), {
      sleep,
      random: () => 0.5,
    })
    provider.search
      .mockResolvedValueOnce({
        candidates: [],
        warnings: [
          {
            provider: "amap",
            code: "timeout",
            message: "temporary timeout",
            retryable: true,
          },
        ],
      })
      .mockResolvedValueOnce({
        candidates: [],
        warnings: [
          {
            provider: "amap",
            code: "provider_error",
            message: "temporary 503",
            retryable: true,
          },
        ],
      })
      .mockResolvedValueOnce({ candidates: [amapCandidate()], warnings: [] })

    await expect(
      service.enrichPlace({ placeId: "palace" })
    ).resolves.toMatchObject({
      matchStatus: "AUTO_APPROVED",
      providerAttempts: 3,
    })
    expect(provider.search).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenNthCalledWith(1, 200)
    expect(sleep).toHaveBeenNthCalledWith(2, 400)
  })

  it("returns NO_MATCH after retryable provider exhaustion", async () => {
    const { service, provider } = serviceFor(catalogCandidate(), {
      sleep: vi.fn().mockResolvedValue(undefined),
      random: () => 0.5,
    })
    provider.search.mockResolvedValue({
      candidates: [],
      warnings: [
        {
          provider: "amap",
          code: "timeout",
          message: "provider timed out",
          retryable: true,
        },
      ],
    })

    const result = await service.enrichPlace({ placeId: "palace" })

    expect(provider.search).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({
      matchStatus: "NO_MATCH",
      warnings: [expect.objectContaining({ attempts: 3, exhausted: true })],
    })
  })
})
