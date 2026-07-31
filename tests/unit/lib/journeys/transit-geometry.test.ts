import { describe, expect, it } from "vitest"
import {
  buildSmoothSchematicPath,
  edgeGeometryKey,
  getEdgePathPositions,
  isRoadTransportMode,
  parseDirectionPolylines,
  simplifyPositions,
  type LngLatTuple,
} from "@/lib/journeys/transit-geometry"

// 北京 / 上海：约 1000+ 公里
const beijing = { lat: 39.9042, lng: 116.4074 }
const shanghai = { lat: 31.2304, lng: 121.4737 }
// 上海市内两点：约 5 公里
const bund = { lat: 31.2397, lng: 121.4903 }
const xintiandi = { lat: 31.2192, lng: 121.4763 }

function chordMidpoint(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
) {
  return { lng: (a.lng + b.lng) / 2, lat: (a.lat + b.lat) / 2 }
}

describe("getEdgePathPositions", () => {
  it("draws a straight two-point line for ground modes", () => {
    const path = getEdgePathPositions(beijing, shanghai, "CAR")
    expect(path).toEqual([
      [beijing.lng, beijing.lat],
      [shanghai.lng, shanghai.lat],
    ])
  })

  it("draws an arc for FLIGHT with matching endpoints", () => {
    const path = getEdgePathPositions(beijing, shanghai, "FLIGHT")
    expect(path.length).toBeGreaterThan(2)
    expect(path[0]).toEqual([beijing.lng, beijing.lat])
    expect(path[path.length - 1]).toEqual([shanghai.lng, shanghai.lat])

    const mid = path[Math.floor(path.length / 2)]
    const chordMid = chordMidpoint(beijing, shanghai)
    const offset = Math.hypot(mid[0] - chordMid.lng, mid[1] - chordMid.lat)
    expect(offset).toBeGreaterThan(0.1)
  })

  it("bulges toward increasing latitude regardless of edge direction", () => {
    const forward = getEdgePathPositions(beijing, shanghai, "FLIGHT")
    const backward = getEdgePathPositions(shanghai, beijing, "FLIGHT")
    const chordMid = chordMidpoint(beijing, shanghai)
    const forwardMid = forward[Math.floor(forward.length / 2)]
    const backwardMid = backward[Math.floor(backward.length / 2)]
    expect(forwardMid[1]).toBeGreaterThan(chordMid.lat)
    expect(backwardMid[1]).toBeGreaterThan(chordMid.lat)
  })

  it("draws a gentler arc for TRAIN than FLIGHT", () => {
    const flight = getEdgePathPositions(beijing, shanghai, "FLIGHT")
    const train = getEdgePathPositions(beijing, shanghai, "TRAIN")
    const chordMid = chordMidpoint(beijing, shanghai)
    const flightMid = flight[Math.floor(flight.length / 2)]
    const trainMid = train[Math.floor(train.length / 2)]
    const flightOffset = Math.hypot(
      flightMid[0] - chordMid.lng,
      flightMid[1] - chordMid.lat
    )
    const trainOffset = Math.hypot(
      trainMid[0] - chordMid.lng,
      trainMid[1] - chordMid.lat
    )
    expect(trainOffset).toBeGreaterThan(0)
    expect(trainOffset).toBeLessThan(flightOffset)
  })

  it("auto-arcs long edges without a transport mode", () => {
    const path = getEdgePathPositions(beijing, shanghai)
    expect(path.length).toBeGreaterThan(2)
  })

  it("keeps short edges without a transport mode straight", () => {
    const path = getEdgePathPositions(bund, xintiandi)
    expect(path).toEqual([
      [bund.lng, bund.lat],
      [xintiandi.lng, xintiandi.lat],
    ])
  })

  it("handles identical endpoints without NaN", () => {
    const path = getEdgePathPositions(beijing, beijing, "FLIGHT")
    expect(path).toEqual([
      [beijing.lng, beijing.lat],
      [beijing.lng, beijing.lat],
    ])
  })
})

describe("buildSmoothSchematicPath", () => {
  it("passes through each railway station anchor", () => {
    const stations: LngLatTuple[] = [
      [102.722722, 25.015486],
      [102.063658, 25.120056],
      [101.747617, 25.135714],
      [101.544387, 25.082103],
      [100.2687, 25.6065],
    ]
    const path = buildSmoothSchematicPath(stations)

    expect(path.length).toBeGreaterThan(stations.length)
    expect(path[0]).toEqual(stations[0])
    expect(path[path.length - 1]).toEqual(stations[stations.length - 1])
    for (const station of stations) {
      expect(path).toContainEqual(station)
    }
  })

  it("uses a gentle arc when only two railway stations are known", () => {
    const path = buildSmoothSchematicPath([
      [beijing.lng, beijing.lat],
      [shanghai.lng, shanghai.lat],
    ])
    expect(path.length).toBeGreaterThan(2)
    expect(path[0]).toEqual([beijing.lng, beijing.lat])
    expect(path[path.length - 1]).toEqual([shanghai.lng, shanghai.lat])
  })
})

describe("isRoadTransportMode", () => {
  it("marks road-network modes as resolvable", () => {
    expect(isRoadTransportMode("CAR")).toBe(true)
    expect(isRoadTransportMode("WALK")).toBe(true)
    expect(isRoadTransportMode("FLIGHT")).toBe(false)
    expect(isRoadTransportMode("TRAIN")).toBe(false)
    expect(isRoadTransportMode(undefined)).toBe(false)
  })
})

describe("edgeGeometryKey", () => {
  it("is stable across sub-meter coordinate noise", () => {
    const a = edgeGeometryKey(beijing, shanghai, "CAR")
    const b = edgeGeometryKey(
      { lat: beijing.lat + 1e-7, lng: beijing.lng - 1e-7 },
      shanghai,
      "CAR"
    )
    expect(a).toBe(b)
  })

  it("varies by transport mode and endpoints", () => {
    const car = edgeGeometryKey(beijing, shanghai, "CAR")
    expect(edgeGeometryKey(beijing, shanghai, "WALK")).not.toBe(car)
    expect(edgeGeometryKey(shanghai, beijing, "CAR")).not.toBe(car)
    expect(edgeGeometryKey(beijing, shanghai)).toContain("NONE")
  })
})

describe("parseDirectionPolylines", () => {
  it("concatenates steps and drops consecutive duplicates", () => {
    const positions = parseDirectionPolylines([
      "116.1,39.1;116.2,39.2",
      "116.2,39.2;116.3,39.3",
    ])
    expect(positions).toEqual([
      [116.1, 39.1],
      [116.2, 39.2],
      [116.3, 39.3],
    ])
  })

  it("skips malformed pairs", () => {
    const positions = parseDirectionPolylines(["116.1,39.1;bad;116.2,39.2"])
    expect(positions).toEqual([
      [116.1, 39.1],
      [116.2, 39.2],
    ])
  })
})

describe("simplifyPositions", () => {
  it("collapses collinear points and keeps endpoints", () => {
    const line: LngLatTuple[] = Array.from({ length: 11 }, (_, i) => [
      116 + i * 0.01,
      39,
    ])
    expect(simplifyPositions(line)).toEqual([
      [116, 39],
      [116.1, 39],
    ])
  })

  it("keeps significant detours", () => {
    const positions: LngLatTuple[] = [
      [116, 39],
      [116.05, 39.02],
      [116.1, 39],
    ]
    expect(simplifyPositions(positions)).toEqual(positions)
  })
})
