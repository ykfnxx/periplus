import { afterEach, describe, expect, it } from "vitest"
import { normalizePlaceSearchInput } from "@/lib/places/normalize"
import { AMapPlaceProvider } from "@/lib/places/providers/amap"

const originalAmapKey = process.env.PERIPLUS_AMAP_WEB_SERVICE_KEY
const originalPublicAmapKey = process.env.NEXT_PUBLIC_AMAP_KEY

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

describe("AMapPlaceProvider", () => {
  afterEach(() => {
    restoreEnv("PERIPLUS_AMAP_WEB_SERVICE_KEY", originalAmapKey)
    restoreEnv("NEXT_PUBLIC_AMAP_KEY", originalPublicAmapKey)
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
})
