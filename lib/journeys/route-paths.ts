import type { JourneyEvent } from "@/modules/data-model/contracts"
import { coordinateToWgs84 } from "./coordinates"

type Segment = NonNullable<
  NonNullable<JourneyEvent["transit"]>["route"]
>["plans"][number]["segments"][number]
export function segmentMapPath(
  segment: Segment,
  positions = segment.positions
): [number, number][] {
  const system = segment.coordinateSystem
  if (system === "LOCAL") return []
  return positions.map(([lng, lat]) => coordinateToWgs84(lng, lat, system))
}

export function standaloneTransitPath(event: JourneyEvent): [number, number][] {
  const from = event.transit?.fromLocation?.coordinates
  const to = event.transit?.toLocation?.coordinates
  if (!from || !to) return []
  return [
    coordinateToWgs84(from.lng, from.lat, from.coordinateSystem),
    coordinateToWgs84(to.lng, to.lat, to.coordinateSystem),
  ]
}

export function eventRoutePositions(event: JourneyEvent): [number, number][] {
  if (event.transit?.routeState === "READY") {
    return (
      event.transit.route?.plans[0]?.segments.flatMap((segment) =>
        segmentMapPath(segment)
      ) ?? []
    )
  }
  return standaloneTransitPath(event)
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
