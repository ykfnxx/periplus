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
  return {
    service: new PlaceIntelligenceService(repository, provider),
    repository,
  }
}

describe("PlaceIntelligenceService", () => {
  it("aggregates catalog and live results into a journey-ready place", async () => {
    const { service } = serviceFor()

    const result = await service.resolvePlaceForJourneyEvent({
      text: "故宫博物院",
      city: "北京",
      eventId: "event-1",
    })

    expect(result).toMatchObject({
      status: "ready",
      place: { placeId: "palace", canAddToJourney: true },
      linkToolCall: {
        tool: "journey.link_place",
        input: {
          eventId: "event-1",
          place: {
            placeId: "palace",
            providerPlaceId: "B000A8UIN8",
            coordinate: { coordinateSystem: "GCJ02" },
          },
        },
      },
    })
  })

  it("writes back a clear provider match during enrichment", async () => {
    const { service, repository } = serviceFor()

    const result = await service.enrichPlace({
      placeId: "palace",
      fields: ["coordinates", "provider_match"],
    })

    expect(result.matchStatus).toBe("AUTO_APPROVED")
    expect(repository.linkProviderMatch).toHaveBeenCalledWith(
      "palace",
      expect.objectContaining({ name: "故宫博物院" })
    )
  })
})
