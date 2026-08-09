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
    images: [
      {
        provider: "amap",
        url: "https://images.example/palace.jpg",
        fetchedAt: "2026-08-03T00:00:00.000Z",
        width: 1200,
        height: 800,
      },
    ],
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
    search: vi.fn().mockResolvedValue({
      candidates: [confidenceSource],
      topConfidence: confidenceSource.sourceConfidence,
    }),
    findById: vi.fn().mockResolvedValue(confidenceSource),
    persistLiveCandidates: vi.fn().mockResolvedValue(undefined),
    linkProviderMatch: vi.fn().mockResolvedValue(undefined),
    persistMatchReview: vi.fn().mockResolvedValue("review-1"),
  }
  const provider = {
    search: vi
      .fn()
      .mockResolvedValue({ candidates: [amapCandidate()], warnings: [] }),
  }
  const logUsage = vi.fn().mockResolvedValue(undefined)
  const imageProbe = vi.fn().mockResolvedValue(true)
  return {
    service: new PlaceIntelligenceService(
      repository,
      provider,
      logUsage,
      imageProbe
    ),
    repository,
    provider,
    logUsage,
    imageProbe,
  }
}

describe("PlaceIntelligenceService", () => {
  it("aggregates catalog and live results into canonical resolved evidence", async () => {
    const { service, logUsage } = serviceFor()

    const result = await service.resolvePlace(
      {
        text: "故宫博物院",
        city: "北京",
      },
      {
        userId: "owner-1",
        workspaceId: "workspace-1",
        agentRunId: "run-1",
        requestId: "place-request-1",
      }
    )

    expect(result).toMatchObject({
      status: "resolved",
      place: { placeId: "palace", canAddToJourney: true },
      placeRef: {
        provider: "amap",
        providerId: "B000A8UIN8",
        canonicalName: "故宫博物院",
        city: "北京市",
        lat: 39.916,
        lng: 116.397,
        coordinateSystem: "GCJ02",
      },
    })
    expect(logUsage).toHaveBeenCalledWith(
      "place_search",
      "success",
      undefined,
      {
        userId: "owner-1",
        workspaceId: "workspace-1",
        agentRunId: "run-1",
        requestId: "place-request-1",
      }
    )
  })

  it("writes back a clear provider match during enrichment", async () => {
    const { service, repository, logUsage } = serviceFor()

    const result = await service.enrichPlace(
      {
        placeId: "palace",
        fields: ["coordinates", "images", "provider_match"],
      },
      { requestId: "enrich-request-1" }
    )

    expect(result.matchStatus).toBe("AUTO_APPROVED")
    expect(repository.linkProviderMatch).toHaveBeenCalledWith(
      "palace",
      expect.objectContaining({ name: "故宫博物院" })
    )
    expect(logUsage).toHaveBeenCalledWith(
      "place_enrich",
      "success",
      undefined,
      { requestId: "enrich-request-1" }
    )
  })

  it("degrades a 404 image to a warning without invalidating resolved evidence", async () => {
    const { service, imageProbe } = serviceFor()
    imageProbe.mockResolvedValue(false)

    const result = await service.verifyPlaceImages(
      catalogCandidate().images ?? []
    )

    expect(result).toMatchObject({
      images: [],
      warnings: [
        expect.objectContaining({
          code: "IMAGE_UNAVAILABLE",
          image: expect.objectContaining({
            provider: "amap",
            url: "https://images.example/palace.jpg",
            fetchedAt: "2026-08-03T00:00:00.000Z",
            width: 1200,
            height: 800,
          }),
        }),
      ],
    })
  })

  it("accepts a unique actionable live result and honors requireExact", async () => {
    const { service, provider } = serviceFor(amapCandidate())
    provider.search.mockResolvedValue({ candidates: [], warnings: [] })

    const result = await service.resolvePlace({ text: "故宫", city: "北京" })
    const exact = await service.resolvePlace({
      text: "故宫",
      city: "北京",
      requireExact: true,
    })

    expect(result).toMatchObject({ status: "resolved" })
    expect(exact).toMatchObject({ status: "ambiguous" })
  })

  it("records provider warning failures against the scoped request", async () => {
    const { service, repository, provider, logUsage } = serviceFor()
    repository.search.mockResolvedValue({ candidates: [], topConfidence: 0 })
    provider.search.mockResolvedValue({
      candidates: [],
      warnings: [
        {
          provider: "amap",
          code: "quota_exceeded",
          message: "quota exhausted",
        },
      ],
    })

    await service.searchPlaces(
      { query: "故宫", includeLiveProvider: true },
      { workspaceId: "workspace-1", requestId: "search-error-1" }
    )

    expect(logUsage).toHaveBeenCalledWith(
      "place_search",
      "error",
      "quota_exceeded",
      { workspaceId: "workspace-1", requestId: "search-error-1" }
    )
  })
})
