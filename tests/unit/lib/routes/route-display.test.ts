import { describe, expect, it } from "vitest"
import {
  formatRouteDistance,
  formatRouteDuration,
  pointAlongPolyline,
  routeBadgeAnchor,
} from "@/lib/routes/route-display"
import type { RoutePlan } from "@/types/route"

function createPlan(): RoutePlan {
  return {
    id: "plan-1",
    provider: "amap",
    rank: 0,
    label: "推荐方案",
    strategy: "recommended",
    distanceMeters: 12_500,
    durationSeconds: 4_020,
    trafficBasis: "TYPICAL",
    calculatedAt: "2026-07-29T00:00:00.000Z",
    requestFingerprint: "fingerprint",
    segments: [
      {
        id: "walk",
        order: 0,
        mode: "WALK",
        geometryKind: "ROAD_NETWORK",
        coordinateSystem: "GCJ02",
        positions: [
          [108, 34],
          [108.03, 34],
        ],
      },
      {
        id: "rail",
        order: 1,
        mode: "RAIL",
        geometryKind: "TRANSIT_LINE",
        coordinateSystem: "GCJ02",
        positions: [
          [108.03, 34],
          [106, 35],
          [104, 36],
        ],
      },
    ],
  }
}

describe("route display helpers", () => {
  it("formats route duration and distance for compact badges", () => {
    expect(formatRouteDuration(22 * 60)).toBe("22 分钟")
    expect(formatRouteDuration(72 * 60)).toBe("1 小时 12 分")
    expect(formatRouteDistance(684)).toBe("684 米")
    expect(formatRouteDistance(12_800)).toBe("13 公里")
  })

  it("finds a position by travelled polyline length instead of endpoint average", () => {
    const point = pointAlongPolyline(
      [
        [0, 0],
        [9, 0],
        [9, 1],
      ],
      0.5
    )

    expect(point[0]).toBeCloseTo(5, 1)
    expect(point[1]).toBeCloseTo(0, 3)
  })

  it("places a transit badge on the main non-walking segment", () => {
    const anchor = routeBadgeAnchor(createPlan())

    expect(anchor?.segment.id).toBe("rail")
    expect(anchor?.position[0]).toBeCloseTo(106, 1)
    expect(anchor?.position[1]).toBeCloseTo(35, 1)
  })
})
