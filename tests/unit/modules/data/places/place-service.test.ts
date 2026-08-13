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

function serviceFor(
  confidenceSource = catalogCandidate(),
  retry: ConstructorParameters<typeof PlaceIntelligenceService>[4] = {}
) {
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
      imageProbe,
      retry
    ),
    repository,
    provider,
    logUsage,
    imageProbe,
  }
}

describe("PlaceIntelligenceService", () => {
  it("selects the top writable candidate without cross-provider identity merging", async () => {
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
      place: { canAddToJourney: true },
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
    expect(result).not.toHaveProperty("place.placeId")
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

  it("selects an exact actionable name and city match despite a close second result", async () => {
    const { service, repository, provider } = serviceFor()
    repository.search.mockResolvedValue({ candidates: [], topConfidence: 0 })
    provider.search.mockResolvedValue({
      candidates: [
        amapCandidate(),
        {
          ...amapCandidate(),
          candidateId: "amap-palace-north-gate",
          providerId: "B000A8UIN8-NORTH",
          name: "故宫博物院北门",
          normalizedName: "故宫博物院北门",
          sources: [{ provider: "amap", providerId: "B000A8UIN8-NORTH" }],
        },
      ],
      warnings: [],
    })

    const result = await service.resolvePlace({
      text: "故宫博物院",
      city: "北京",
    })

    expect(result).toMatchObject({
      status: "resolved",
      place: { name: "故宫博物院" },
    })
  })

  it("retries transient provider failures twice before returning a result", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined)
    const { service, repository, provider } = serviceFor(catalogCandidate(), {
      sleep,
      random: () => 0.5,
    })
    repository.search.mockResolvedValue({ candidates: [], topConfidence: 0 })
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
      service.resolvePlace({ text: "故宫博物院", city: "北京" })
    ).resolves.toMatchObject({ status: "resolved", providerAttempts: 3 })
    expect(provider.search).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenNthCalledWith(1, 200)
    expect(sleep).toHaveBeenNthCalledWith(2, 400)
  })

  it("returns not_found after retryable provider exhaustion without a fallback contract", async () => {
    const { service, repository, provider } = serviceFor(catalogCandidate(), {
      sleep: vi.fn().mockResolvedValue(undefined),
      random: () => 0.5,
    })
    repository.search.mockResolvedValue({ candidates: [], topConfidence: 0 })
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

    const result = await service.resolvePlace({
      text: "大理古城",
      city: "大理",
    })

    expect(provider.search).toHaveBeenCalledTimes(3)
    expect(result).toMatchObject({
      status: "not_found",
      warnings: [expect.objectContaining({ attempts: 3, exhausted: true })],
    })
    expect(result).not.toHaveProperty("fallbackAllowed")
    expect(result).not.toHaveProperty("fallbackQuery")
  })

  it("opens a run-level circuit after a hard provider quota failure", async () => {
    const { service, repository, provider } = serviceFor(catalogCandidate(), {
      now: () => 1000,
    })
    repository.search.mockResolvedValue({ candidates: [], topConfidence: 0 })
    provider.search.mockResolvedValue({
      candidates: [],
      warnings: [
        {
          provider: "amap",
          code: "quota_exceeded",
          message: "hard quota exhausted",
          retryable: false,
        },
      ],
    })
    const context = { agentRunId: "hard-quota-run" }

    await expect(
      service.resolvePlace({ text: "故宫", city: "北京" }, context)
    ).resolves.toMatchObject({
      status: "not_found",
      warnings: [expect.objectContaining({ attempts: 1, exhausted: true })],
    })
    await expect(
      service.resolvePlace({ text: "天坛", city: "北京" }, context)
    ).resolves.toMatchObject({
      status: "not_found",
      warnings: [expect.objectContaining({ attempts: 0, exhausted: true })],
    })
    expect(provider.search).toHaveBeenCalledOnce()
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
