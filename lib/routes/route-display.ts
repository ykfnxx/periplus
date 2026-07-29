import type {
  RouteLngLat,
  RoutePlan,
  RouteSegment,
  RouteSegmentMode,
} from "@/types/route"

const EARTH_RADIUS_METERS = 6_371_000

export interface RouteBadgeAnchor {
  position: RouteLngLat
  segment: RouteSegment
}

export function formatRouteDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} 分钟`

  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return remainingMinutes ? `${hours} 小时 ${remainingMinutes} 分` : `${hours} 小时`
}

export function formatRouteDistance(meters: number) {
  if (meters < 1_000) return `${Math.max(1, Math.round(meters))} 米`
  const kilometers = meters / 1_000
  return `${kilometers >= 10 ? Math.round(kilometers) : kilometers.toFixed(1)} 公里`
}

export function routeModeLabel(mode: RouteSegmentMode) {
  const labels: Record<RouteSegmentMode, string> = {
    WALK: "步行",
    DRIVE: "驾车",
    BUS: "公交",
    SUBWAY: "地铁",
    RAIL: "火车",
    TAXI: "出租车",
    FLIGHT: "飞机",
  }
  return labels[mode]
}

export function routeBadgeAnchor(plan: RoutePlan): RouteBadgeAnchor | null {
  const candidates = plan.segments
    .filter(
      (segment) =>
        segment.geometryKind !== "NONE" && segment.positions.length >= 2
    )
    .map((segment) => ({
      segment,
      length: polylineLengthMeters(segment.positions),
    }))
    .sort((left, right) => {
      // 公交方案优先把标签放在主交通段，避免落在起终点的短步行接驳上。
      const leftWalkPenalty = left.segment.mode === "WALK" ? 1 : 0
      const rightWalkPenalty = right.segment.mode === "WALK" ? 1 : 0
      if (leftWalkPenalty !== rightWalkPenalty) {
        return leftWalkPenalty - rightWalkPenalty
      }
      return right.length - left.length
    })

  const candidate = candidates[0]
  if (!candidate) return null

  return {
    position: pointAlongPolyline(candidate.segment.positions, 0.5),
    segment: candidate.segment,
  }
}

export function pointAlongPolyline(
  positions: RouteLngLat[],
  ratio: number
): RouteLngLat {
  if (positions.length === 0) return [0, 0]
  if (positions.length === 1) return positions[0]

  const boundedRatio = Math.min(1, Math.max(0, ratio))
  const lengths: number[] = []
  let totalLength = 0

  for (let index = 1; index < positions.length; index += 1) {
    const length = haversineMeters(positions[index - 1], positions[index])
    lengths.push(length)
    totalLength += length
  }

  if (totalLength === 0) return positions[0]

  const targetLength = totalLength * boundedRatio
  let traversed = 0

  for (let index = 0; index < lengths.length; index += 1) {
    const segmentLength = lengths[index]
    if (traversed + segmentLength >= targetLength) {
      const localRatio =
        segmentLength === 0 ? 0 : (targetLength - traversed) / segmentLength
      const [fromLng, fromLat] = positions[index]
      const [toLng, toLat] = positions[index + 1]
      return [
        fromLng + (toLng - fromLng) * localRatio,
        fromLat + (toLat - fromLat) * localRatio,
      ]
    }
    traversed += segmentLength
  }

  return positions.at(-1)!
}

export function polylineLengthMeters(positions: RouteLngLat[]) {
  let totalLength = 0
  for (let index = 1; index < positions.length; index += 1) {
    totalLength += haversineMeters(positions[index - 1], positions[index])
  }
  return totalLength
}

function haversineMeters(from: RouteLngLat, to: RouteLngLat) {
  const [fromLng, fromLat] = from
  const [toLng, toLat] = to
  const lat1 = degreesToRadians(fromLat)
  const lat2 = degreesToRadians(toLat)
  const deltaLat = degreesToRadians(toLat - fromLat)
  const deltaLng = degreesToRadians(toLng - fromLng)
  const sinLat = Math.sin(deltaLat / 2)
  const sinLng = Math.sin(deltaLng / 2)
  const a =
    sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng
  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)))
  )
}

function degreesToRadians(degrees: number) {
  return (degrees * Math.PI) / 180
}
