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

function serviceFor(confidenceSource = catalogCandidate()) {
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
    service: new PlaceIntelligenceService(repository, provider),
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

  it("returns a provider failure directly and allows a later explicit attempt", async () => {
    const { service, provider, repository } = serviceFor()
    provider.search.mockResolvedValueOnce({
      candidates: [],
      warnings: [
        { provider: "amap", code: "timeout", message: "temporary timeout" },
      ],
    })

    await expect(
      service.enrichPlace({ placeId: "palace" })
    ).resolves.toMatchObject({
      matchStatus: "NO_MATCH",
      warnings: [{ code: "timeout", message: "temporary timeout" }],
    })
    expect(provider.search).toHaveBeenCalledTimes(1)
    expect(repository.linkProviderMatch).not.toHaveBeenCalled()
    expect(repository.persistMatchReview).not.toHaveBeenCalled()

    await expect(
      service.enrichPlace({ placeId: "palace" })
    ).resolves.toMatchObject({
      matchStatus: "AUTO_APPROVED",
      warnings: [],
    })
    expect(provider.search).toHaveBeenCalledTimes(2)
    expect(repository.linkProviderMatch).toHaveBeenCalledTimes(1)
  })

  it("returns an unmatched response without retrying or writing a match", async () => {
    const { service, provider, repository } = serviceFor()
    provider.search.mockResolvedValue({ candidates: [], warnings: [] })

    const result = await service.enrichPlace({ placeId: "palace" })

    expect(provider.search).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({
      matchStatus: "NO_MATCH",
      results: [],
      warnings: [],
    })
    expect(repository.linkProviderMatch).not.toHaveBeenCalled()
    expect(repository.persistMatchReview).not.toHaveBeenCalled()
  })
})
