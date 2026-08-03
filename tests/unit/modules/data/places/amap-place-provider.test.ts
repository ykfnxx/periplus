import { afterEach, describe, expect, it, vi } from "vitest"
import { normalizePlaceSearchInput } from "@/lib/places/normalize"
import { AMapPlaceProvider } from "@/modules/data/places/providers/amap-place-provider"

const originalAmapKey = process.env.PERIPLUS_AMAP_WEB_SERVICE_KEY
const originalPublicAmapKey = process.env.NEXT_PUBLIC_AMAP_KEY
const originalFetch = global.fetch

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

describe("AMapPlaceProvider", () => {
  afterEach(() => {
    restoreEnv("PERIPLUS_AMAP_WEB_SERVICE_KEY", originalAmapKey)
    restoreEnv("NEXT_PUBLIC_AMAP_KEY", originalPublicAmapKey)
    global.fetch = originalFetch
  })

  it("returns a warning instead of throwing when no key is configured", async () => {
    delete process.env.PERIPLUS_AMAP_WEB_SERVICE_KEY
    delete process.env.NEXT_PUBLIC_AMAP_KEY

    const provider = new AMapPlaceProvider()
    const result = await provider.search(
      normalizePlaceSearchInput({ query: "西湖", city: "杭州" })
    )

    expect(result.candidates).toEqual([])
    expect(result.warnings).toMatchObject([
      { provider: "amap", code: "provider_error" },
    ])
  })

  it("requests expanded POI data and normalizes attraction photos", async () => {
    process.env.PERIPLUS_AMAP_WEB_SERVICE_KEY = "test-key"
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: "1",
          pois: [
            {
              id: "poi-1",
              name: "兵马俑",
              type: "风景名胜",
              location: "109.278,34.385",
              photos: [
                { title: "主图", url: "https://images.example/terracotta.jpg" },
              ],
            },
          ],
        })
      )
    )
    global.fetch = fetchMock

    const result = await new AMapPlaceProvider().search(
      normalizePlaceSearchInput({ query: "兵马俑", city: "西安" })
    )

    expect(
      (fetchMock.mock.calls[0]?.[0] as URL).searchParams.get("extensions")
    ).toBe("all")
    expect(result.candidates[0]?.images).toMatchObject([
      { provider: "amap", url: "https://images.example/terracotta.jpg" },
    ])
  })
})
