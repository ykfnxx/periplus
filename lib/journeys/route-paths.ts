import type { JourneyEvent } from "@/modules/data-model/contracts"
import { bd09ToGcj02, wgs84ToGcj02 } from "./coordinates"

type Segment = NonNullable<
  NonNullable<JourneyEvent["transit"]>["route"]
>["plans"][number]["segments"][number]
export function segmentMapPath(
  segment: Segment,
  positions = segment.positions
): [number, number][] {
  if (segment.coordinateSystem === "LOCAL") return []
  return positions.map(([lng, lat]) =>
    segment.coordinateSystem === "WGS84"
      ? wgs84ToGcj02(lng, lat)
      : segment.coordinateSystem === "BD09"
        ? bd09ToGcj02(lng, lat)
        : [lng, lat]
  )
}

export function eventRoutePositions(event: JourneyEvent): [number, number][] {
  if (event.transit?.routeState !== "READY") return []
  return (
    event.transit.route?.plans[0]?.segments.flatMap((segment) =>
      segmentMapPath(segment)
    ) ?? []
  )
}

export function eventRouteBounds(event: JourneyEvent): [number, number][] {
  const positions = eventRoutePositions(event)
  if (!positions.length) return []
  let west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity
  for (const [lng, lat] of positions) {
    west = Math.min(west, lng)
    east = Math.max(east, lng)
    south = Math.min(south, lat)
    north = Math.max(north, lat)
  }
  return [
    [west, south],
    [east, north],
  ]
}
