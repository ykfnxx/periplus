import { describe, it, expect } from "vitest"
import { haversineKm, matchPhotosToNode, PROXIMITY_KM } from "@/lib/geo"

describe("haversineKm", () => {
  it("calculates distance between two points", () => {
    // Xi'an to Lanzhou ~500km
    const distance = haversineKm(34.34, 108.94, 36.06, 103.83)
    expect(distance).toBeGreaterThan(450)
    expect(distance).toBeLessThan(550)
  })

  it("returns 0 for same point", () => {
    expect(haversineKm(34.34, 108.94, 34.34, 108.94)).toBe(0)
  })
})

describe("matchPhotosToNode", () => {
  it("matches photos within proximity", () => {
    const photos = [
      { id: "1", lat: 34.34, lng: 108.94, url: "/a.jpg" }, // same point
      { id: "2", lat: 34.35, lng: 108.95, url: "/b.jpg" }, // ~1.5km away
      { id: "3", lat: 34.80, lng: 109.50, url: "/c.jpg" }, // far away
    ]
    const matched = matchPhotosToNode(34.34, 108.94, photos)
    expect(matched).toHaveLength(2)
    expect(matched.map((p) => p.id)).toContain("1")
    expect(matched.map((p) => p.id)).toContain("2")
  })

  it("returns empty array when no photos match", () => {
    const photos = [{ id: "1", lat: 34.80, lng: 109.50, url: "/a.jpg" }]
    expect(matchPhotosToNode(34.34, 108.94, photos)).toHaveLength(0)
  })
})
