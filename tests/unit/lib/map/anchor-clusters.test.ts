import { describe, expect, it } from "vitest"
import {
  calculateAnchorClusters,
  calculateScatterOffsets,
  collectClusteredSourceIds,
  createAnchorItems,
} from "@/lib/map/anchor-clusters"

describe("anchor cluster helpers", () => {
  it("clusters route and photo anchors through the same pixel rule", () => {
    const anchors = createAnchorItems(
      [
        {
          id: "route-1",
          name: "路线点",
          lat: 31,
          lng: 121,
          order: 0,
        },
      ],
      [
        {
          id: "photo-1",
          lat: 31.0001,
          lng: 121.0001,
          imageDataUrl: "/photo.png",
        },
      ]
    )

    const clusters = calculateAnchorClusters(anchors, (anchor) =>
      anchor.type === "route" ? { x: 100, y: 100 } : { x: 112, y: 108 }
    )

    expect(clusters).toHaveLength(1)
    expect(collectClusteredSourceIds(clusters, "route")).toEqual(
      new Set(["route-1"])
    )
    expect(collectClusteredSourceIds(clusters, "photo")).toEqual(
      new Set(["photo-1"])
    )
  })

  it("uses a non-mirrored scatter pattern for two candidates", () => {
    const offsets = calculateScatterOffsets(2)

    expect(offsets).toHaveLength(2)
    expect(offsets[0].x).not.toBeCloseTo(-offsets[1].x)
    expect(offsets[0].y).not.toBeCloseTo(-offsets[1].y)
  })
})
