import { prisma } from "@/modules/data/db/prisma"
import { haversineKm } from "@/lib/geo"
import { periplusServerConfig } from "@/config/periplus.server"
import type { TransportMode } from "@/types/route"
import {
  edgeGeometryKey,
  isRoadTransportMode,
  parseDirectionPolylines,
  simplifyPositions,
  type EdgeEndpoint,
  type LngLatTuple,
} from "@/lib/routes/edge-geometry"

export interface EdgeGeometryRequest {
  from: EdgeEndpoint
  to: EdgeEndpoint
  transportMode?: TransportMode
}

export interface EdgeGeometryResult {
  key: string
  source: string
  positions: LngLatTuple[]
}

interface AMapDirectionResponse {
  status?: string
  info?: string
  route?: {
    paths?: Array<{ steps?: Array<{ polyline?: string }> }>
  }
}

const REQUEST_TIMEOUT_MS = 5000
// 步行规划超过此直线距离基本必失败，直接跳过省配额
const MAX_WALKING_KM = 80

function directionEndpoint(transportMode: TransportMode) {
  return transportMode === "WALK"
    ? "https://restapi.amap.com/v5/direction/walking"
    : "https://restapi.amap.com/v5/direction/driving"
}

function formatLngLat(point: EdgeEndpoint) {
  return `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`
}

async function fetchDirection(
  transportMode: TransportMode,
  from: EdgeEndpoint,
  to: EdgeEndpoint,
  key: string
): Promise<LngLatTuple[] | null> {
  const url = new URL(directionEndpoint(transportMode))
  url.searchParams.set("key", key)
  url.searchParams.set("origin", formatLngLat(from))
  url.searchParams.set("destination", formatLngLat(to))
  url.searchParams.set("show_fields", "polyline")

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, { signal: controller.signal })
    const body = (await response.json()) as AMapDirectionResponse
    if (body.status !== "1") {
      console.warn(
        `[edge-geometry] AMap direction failed (${transportMode}): ${body.info ?? "unknown"}`
      )
      return null
    }
    const steps = body.route?.paths?.[0]?.steps ?? []
    const polylines = steps
      .map((step) => step.polyline)
      .filter((polyline): polyline is string => Boolean(polyline))
    const positions = simplifyPositions(parseDirectionPolylines(polylines))
    return positions.length >= 2 ? positions : null
  } catch (error) {
    console.warn(
      `[edge-geometry] AMap direction request error (${transportMode}):`,
      error instanceof Error ? error.message : error
    )
    return null
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * 批量解析 edge 几何：优先命中 EdgeGeometryCache，未命中的串行请求
 * 高德方向 API（免费配额 QPS 低，不能并发打），成功后写入缓存。
 * 解析失败的 edge 不出现在返回值里，前端自行降级为直线。
 */
export async function resolveEdgeGeometries(
  requests: EdgeGeometryRequest[]
): Promise<EdgeGeometryResult[]> {
  const byKey = new Map<string, EdgeGeometryRequest>()
  for (const request of requests) {
    if (!isRoadTransportMode(request.transportMode)) continue
    if (
      request.from.lat === request.to.lat &&
      request.from.lng === request.to.lng
    ) {
      continue
    }
    byKey.set(
      edgeGeometryKey(request.from, request.to, request.transportMode),
      request
    )
  }
  if (byKey.size === 0) return []

  const cached = await prisma.edgeGeometryCache.findMany({
    where: { key: { in: [...byKey.keys()] } },
  })
  const results: EdgeGeometryResult[] = cached.map((entry) => ({
    key: entry.key,
    source: entry.source,
    positions: JSON.parse(entry.positions) as LngLatTuple[],
  }))
  const cachedKeys = new Set(cached.map((entry) => entry.key))

  const apiKey = periplusServerConfig.amap.webServiceKey
  if (!apiKey) return results

  for (const [key, request] of byKey) {
    if (cachedKeys.has(key)) continue
    const transportMode = request.transportMode!
    if (
      transportMode === "WALK" &&
      haversineKm(
        request.from.lat,
        request.from.lng,
        request.to.lat,
        request.to.lng
      ) > MAX_WALKING_KM
    ) {
      continue
    }

    const positions = await fetchDirection(
      transportMode,
      request.from,
      request.to,
      apiKey
    )
    if (!positions) continue

    const source = transportMode === "WALK" ? "amap-walking" : "amap-driving"
    await prisma.edgeGeometryCache.upsert({
      where: { key },
      create: { key, source, positions: JSON.stringify(positions) },
      update: { source, positions: JSON.stringify(positions) },
    })
    results.push({ key, source, positions })
  }

  return results
}
