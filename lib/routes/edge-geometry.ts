import { haversineKm } from "@/lib/geo"
import type { TransportMode } from "@/types/route"

/** [lng, lat] 坐标对，与 AMap.LngLat 构造参数顺序一致 */
export type LngLatTuple = [number, number]

export interface EdgeEndpoint {
  lat: number
  lng: number
}

// 弧线弯曲度 = 控制点偏移量 / 弦长；未列出的交通方式画直线
const ARC_CURVATURES: Partial<Record<TransportMode, number>> = {
  FLIGHT: 0.2,
  TRAIN: 0.08,
}

// 走真实路网、需要请求高德方向 API 的交通方式
const ROAD_TRANSPORT_MODES: ReadonlySet<TransportMode> = new Set([
  "CAR",
  "TAXI",
  "RENTAL",
  "BUS",
  "WALK",
])

export function isRoadTransportMode(
  transportMode?: TransportMode
): transportMode is TransportMode {
  return Boolean(transportMode && ROAD_TRANSPORT_MODES.has(transportMode))
}

function roundCoord(value: number) {
  return Math.round(value * 1e5) / 1e5
}

/**
 * 几何缓存 key：由端点坐标（约 1 米精度）和交通方式决定，
 * 与 edge id 无关，草稿刷新、路线重存后依然命中。
 * 前后端必须使用同一实现。
 */
export function edgeGeometryKey(
  from: EdgeEndpoint,
  to: EdgeEndpoint,
  transportMode?: TransportMode
): string {
  return `${roundCoord(from.lng)},${roundCoord(from.lat)}|${roundCoord(to.lng)},${roundCoord(to.lat)}|${transportMode ?? "NONE"}`
}

/**
 * 解析高德方向 API 返回的 steps polyline（"lng,lat;lng,lat;..."），
 * 拼接并去掉相邻重复点。
 */
export function parseDirectionPolylines(polylines: string[]): LngLatTuple[] {
  const positions: LngLatTuple[] = []
  for (const polyline of polylines) {
    for (const pair of polyline.split(";")) {
      const [lngRaw, latRaw] = pair.split(",")
      const lng = Number(lngRaw)
      const lat = Number(latRaw)
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
      const last = positions[positions.length - 1]
      if (last && last[0] === lng && last[1] === lat) continue
      positions.push([lng, lat])
    }
  }
  return positions
}

/**
 * Douglas-Peucker 抽稀，容差单位为度（1e-4 约 10 米），端点保留。
 */
export function simplifyPositions(
  positions: LngLatTuple[],
  tolerance = 1e-4
): LngLatTuple[] {
  if (positions.length <= 2) return positions
  const keep = new Array<boolean>(positions.length).fill(false)
  keep[0] = keep[positions.length - 1] = true

  const stack: Array<[number, number]> = [[0, positions.length - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()!
    let maxDistance = 0
    let maxIndex = start
    for (let i = start + 1; i < end; i++) {
      const distance = pointToSegmentDistance(
        positions[i],
        positions[start],
        positions[end]
      )
      if (distance > maxDistance) {
        maxDistance = distance
        maxIndex = i
      }
    }
    if (maxDistance > tolerance) {
      keep[maxIndex] = true
      stack.push([start, maxIndex], [maxIndex, end])
    }
  }

  return positions.filter((_, i) => keep[i])
}

function pointToSegmentDistance(
  point: LngLatTuple,
  segStart: LngLatTuple,
  segEnd: LngLatTuple
): number {
  const dx = segEnd[0] - segStart[0]
  const dy = segEnd[1] - segStart[1]
  const lengthSquared = dx * dx + dy * dy
  let t = 0
  if (lengthSquared > 0) {
    t =
      ((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dy) /
      lengthSquared
    t = Math.max(0, Math.min(1, t))
  }
  return Math.hypot(
    point[0] - (segStart[0] + t * dx),
    point[1] - (segStart[1] + t * dy)
  )
}

const ARC_SEGMENTS = 64
// 未指定交通方式时，超过该距离的段视为长途，按弧线绘制
const AUTO_ARC_MIN_KM = 200
const AUTO_ARC_CURVATURE = 0.12

/**
 * 计算一条 edge 的绘制路径。飞机/火车（以及未指定方式的长途段）
 * 返回二次贝塞尔弧线采样点，其余返回起终点直线。
 */
export function getEdgePathPositions(
  from: EdgeEndpoint,
  to: EdgeEndpoint,
  transportMode?: TransportMode
): LngLatTuple[] {
  const curvature = resolveCurvature(from, to, transportMode)
  if (!curvature) {
    return [
      [from.lng, from.lat],
      [to.lng, to.lat],
    ]
  }
  return buildArcPositions(from, to, curvature)
}

function resolveCurvature(
  from: EdgeEndpoint,
  to: EdgeEndpoint,
  transportMode?: TransportMode
): number {
  if (transportMode) return ARC_CURVATURES[transportMode] ?? 0
  return haversineKm(from.lat, from.lng, to.lat, to.lng) >= AUTO_ARC_MIN_KM
    ? AUTO_ARC_CURVATURE
    : 0
}

function buildArcPositions(
  from: EdgeEndpoint,
  to: EdgeEndpoint,
  curvature: number
): LngLatTuple[] {
  const x1 = from.lng
  const y1 = from.lat
  const x2 = to.lng
  const y2 = to.lat
  const dx = x2 - x1
  const dy = y2 - y1
  const chordLength = Math.hypot(dx, dy)
  if (chordLength === 0) {
    return [
      [x1, y1],
      [x2, y2],
    ]
  }

  // 单位法向量固定取纬度增大的一侧，同一条边无论方向弧形都稳定朝上
  let nx = -dy / chordLength
  let ny = dx / chordLength
  if (ny < 0 || (ny === 0 && nx < 0)) {
    nx = -nx
    ny = -ny
  }

  const controlX = (x1 + x2) / 2 + nx * chordLength * curvature
  const controlY = (y1 + y2) / 2 + ny * chordLength * curvature

  const positions: LngLatTuple[] = []
  for (let i = 0; i <= ARC_SEGMENTS; i++) {
    const t = i / ARC_SEGMENTS
    const mt = 1 - t
    positions.push([
      mt * mt * x1 + 2 * mt * t * controlX + t * t * x2,
      mt * mt * y1 + 2 * mt * t * controlY + t * t * y2,
    ])
  }
  return positions
}
