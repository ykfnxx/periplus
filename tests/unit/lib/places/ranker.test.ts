import { describe, expect, it } from "vitest"
import { normalizePlaceSearchInput } from "@/lib/places/normalize"
import { rankPlaceCandidates } from "@/lib/places/ranker"
import type { PlaceCandidate } from "@/lib/places/types"

describe("rankPlaceCandidates", () => {
  it("prefers provider coordinates that match the current map provider", () => {
    const query = normalizePlaceSearchInput({
      query: "西湖",
      city: "杭州",
      categories: ["SIGHT"],
      coordinatePreference: "auto",
    })
    const candidate: PlaceCandidate = {
      candidateId: "candidate-west-lake",
      placeId: "place-west-lake",
      provider: "periplus",
      name: "西湖风景名胜区",
      normalizedName: "西湖风景名胜区",
      aliases: ["西湖"],
      category: "SIGHT",
      city: "杭州市",
      district: "西湖区",
      coordinates: [
        {
          provider: "periplus",
          coordinateSystem: "WGS84",
          lat: 30.242,
          lng: 120.14,
          accuracy: "approximate",
          source: "catalog",
        },
        {
          provider: "amap",
          coordinateSystem: "GCJ02",
          lat: 30.247,
          lng: 120.146,
          accuracy: "provider_poi",
          source: "provider_search",
        },
      ],
      sources: [
        {
          provider: "periplus",
          providerId: "place-west-lake",
          confidence: 0.95,
        },
        { provider: "amap", providerId: "B023B0", confidence: 0.86 },
      ],
      sourceConfidence: 0.95,
      fromLiveProvider: false,
    }

    const [result] = rankPlaceCandidates(query, [candidate])

    expect(result.bestCoordinate).toMatchObject({
      provider: "amap",
      coordinateSystem: "GCJ02",
    })
    expect(result.quality).toBe("verified")
    expect(result.canAddToRoute).toBe(true)
    expect(result.needsUserConfirmation).toBe(false)
  })
})
