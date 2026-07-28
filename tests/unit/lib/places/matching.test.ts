import { describe, expect, it } from "vitest"
import { decideProviderMatch } from "@/lib/places/matching"
import type { PlaceSearchResult } from "@/lib/places/types"

function result(confidence: number): PlaceSearchResult {
  return {
    id: "amap-poi",
    name: "故宫博物院",
    normalizedName: "故宫博物院",
    aliases: [],
    category: "SIGHT",
    city: "北京市",
    coordinates: [
      {
        provider: "amap",
        coordinateSystem: "GCJ02",
        lat: 39.916,
        lng: 116.397,
        source: "provider_search",
      },
    ],
    bestCoordinate: {
      provider: "amap",
      coordinateSystem: "GCJ02",
      lat: 39.916,
      lng: 116.397,
      source: "provider_search",
    },
    sources: [{ provider: "amap", providerId: "B000A8UIN8" }],
    confidence,
    quality: confidence >= 0.9 ? "verified" : "probable",
    canAddToRoute: true,
    needsUserConfirmation: false,
    reason: "test",
  }
}

describe("decideProviderMatch", () => {
  it("auto approves a strong clear winner", () => {
    expect(decideProviderMatch([result(0.92), result(0.71)])).toMatchObject({
      status: "AUTO_APPROVED",
      candidate: { confidence: 0.92 },
    })
  })

  it("queues close or low-confidence matches for review", () => {
    expect(decideProviderMatch([result(0.86), result(0.82)])).toMatchObject({
      status: "PENDING_REVIEW",
    })
    expect(decideProviderMatch([result(0.7)])).toMatchObject({
      status: "PENDING_REVIEW",
    })
  })

  it("reports no match when the provider returned nothing", () => {
    expect(decideProviderMatch([])).toEqual({
      status: "NO_MATCH",
      reason: "地图 provider 未返回候选地点",
    })
  })
})
