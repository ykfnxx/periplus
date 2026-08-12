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
    expect(result.canAddToJourney).toBe(true)
    expect(result.needsUserConfirmation).toBe(false)
  })

  it("does not heuristically merge same-name candidates across providers", () => {
    const query = normalizePlaceSearchInput({
      query: "故宫博物院",
      city: "北京",
      categories: ["SIGHT"],
    })
    const catalog: PlaceCandidate = {
      candidateId: "place-place-mct-palace",
      placeId: "place-mct-palace",
      provider: "periplus",
      name: "故宫博物院",
      normalizedName: "故宫博物院",
      aliases: [],
      category: "SIGHT",
      province: "北京",
      city: "北京市",
      coordinates: [],
      sources: [{ provider: "mct", providerId: "mct-palace" }],
      sourceConfidence: 0.95,
      fromLiveProvider: false,
    }
    const live: PlaceCandidate = {
      candidateId: "amap-B000A8UIN8",
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

    const [result] = rankPlaceCandidates(query, [catalog, live])

    expect(result.placeId).toBeUndefined()
    expect(result.sources.map((source) => source.provider)).toEqual(["amap"])
    expect(result.bestCoordinate.coordinateSystem).toBe("GCJ02")
    expect(result.canAddToJourney).toBe(true)
  })

  it("merges only identical provider and providerId records", () => {
    const query = normalizePlaceSearchInput({ query: "西湖", city: "杭州" })
    const first: PlaceCandidate = {
      candidateId: "amap-west-lake-first",
      provider: "amap",
      providerId: "B023B0",
      name: "西湖",
      normalizedName: "西湖",
      aliases: [],
      category: "SIGHT",
      city: "杭州市",
      coordinates: [
        {
          provider: "amap",
          coordinateSystem: "GCJ02",
          lat: 30.247,
          lng: 120.146,
          source: "provider_search",
        },
      ],
      sources: [{ provider: "amap", providerId: "B023B0" }],
      sourceConfidence: 0.8,
      fromLiveProvider: true,
    }
    const duplicate: PlaceCandidate = {
      ...first,
      candidateId: "amap-west-lake-duplicate",
      aliases: ["西湖风景区"],
    }

    const results = rankPlaceCandidates(query, [first, duplicate])

    expect(results).toHaveLength(1)
    expect(results[0]?.aliases).toContain("西湖风景区")
  })
})
