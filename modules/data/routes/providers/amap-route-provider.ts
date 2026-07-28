import { periplusServerConfig } from "@/config/periplus.server"
import { parseDirectionPolylines } from "@/lib/routes/edge-geometry"
import type {
  RoutePlan,
  RouteSegment,
  RouteSegmentMode,
  RouteTrafficBasis,
  RouteTrafficSection,
} from "@/types/route"
import { endpointToGcj02 } from "@/lib/routes/coordinates"
import {
  routePlanFingerprint,
  type RoutePlanBundle,
  type RoutePlanEndpoint,
  type RoutePlanRequest,
  type RouteProviderErrorCode,
} from "@/lib/routes/planning"

type JsonRecord = Record<string, unknown>

export class RouteProviderError extends Error {
  constructor(
    public readonly code: RouteProviderErrorCode,
    message: string
  ) {
    super(message)
    this.name = "RouteProviderError"
  }
}

interface AMapRouteProviderOptions {
  key?: string
  fetcher?: typeof fetch
  now?: () => Date
  timeoutMs?: number
}

export class AMapRouteProvider {
  private readonly key: string
  private readonly fetcher: typeof fetch
  private readonly now: () => Date
  private readonly timeoutMs: number

  constructor(options: AMapRouteProviderOptions = {}) {
    this.key = options.key ?? periplusServerConfig.amap.webServiceKey
    this.fetcher = options.fetcher ?? fetch
    this.now = options.now ?? (() => new Date())
    this.timeoutMs = options.timeoutMs ?? 7000
  }

  async plan(input: RoutePlanRequest): Promise<RoutePlanBundle> {
    if (!this.key) {
      throw new RouteProviderError(
        "AUTH_OR_QUOTA",
        "缺少 PERIPLUS_AMAP_WEB_SERVICE_KEY"
      )
    }
    const request = {
      ...input,
      origin: endpointToGcj02(input.origin),
      destination: endpointToGcj02(input.destination),
    }
    const fingerprint = routePlanFingerprint(request)

    if (request.mode === "TRANSIT") {
      return this.planTransit(request, fingerprint)
    }
    return this.planRoad(request, fingerprint)
  }

  private async planRoad(request: RoutePlanRequest, fingerprint: string) {
    const walking = request.mode === "WALK"
    const url = new URL(
      walking
        ? "https://restapi.amap.com/v5/direction/walking"
        : "https://restapi.amap.com/v5/direction/driving"
    )
    this.setCommonParams(url, request)
    url.searchParams.set(
      "show_fields",
      walking ? "cost,polyline" : "cost,polyline,tmcs"
    )
    if (!walking) url.searchParams.set("strategy", drivingStrategy(request))

    const body = await this.fetchJson(url)
    const paths = arrayField(objectField(body, "route"), "paths")
    const plans = paths
      .slice(0, request.alternatives)
      .map((path, rank) =>
        roadPathToPlan(
          path,
          rank,
          request,
          fingerprint,
          walking ? "WALK" : "DRIVE",
          this.now()
        )
      )
      .filter((plan): plan is RoutePlan => Boolean(plan))
    if (!plans.length)
      throw new RouteProviderError("NO_ROUTE", "未找到可用路线")

    const futureDrive =
      request.mode === "DRIVE" &&
      request.departAt &&
      new Date(request.departAt).getTime() > this.now().getTime() + 15 * 60_000
    return {
      edgeId: request.edgeId,
      requestFingerprint: fingerprint,
      plans,
      warning: futureDrive
        ? "高德普通驾车接口不支持未来出发时刻，当前展示常规预计耗时"
        : undefined,
    }
  }

  private async planTransit(request: RoutePlanRequest, fingerprint: string) {
    const originCity =
      request.origin.cityCode ?? (await this.resolveCityCode(request.origin))
    const destinationCity =
      request.destination.cityCode ??
      (await this.resolveCityCode(request.destination))
    if (!originCity || !destinationCity) {
      throw new RouteProviderError(
        "INVALID_ENDPOINT",
        "公共交通规划需要起终点 citycode"
      )
    }

    const url = new URL(
      "https://restapi.amap.com/v5/direction/transit/integrated"
    )
    this.setCommonParams(url, request)
    url.searchParams.set("city1", originCity)
    url.searchParams.set("city2", destinationCity)
    url.searchParams.set("strategy", transitStrategy(request))
    url.searchParams.set(
      "AlternativeRoute",
      String(Math.max(1, Math.min(request.alternatives, 10)))
    )
    url.searchParams.set("show_fields", "cost,polyline")
    const departAt = request.departAt ? new Date(request.departAt) : this.now()
    if (!Number.isNaN(departAt.getTime())) {
      url.searchParams.set("date", dateParam(departAt))
      url.searchParams.set("time", timeParam(departAt))
    }

    const body = await this.fetchJson(url)
    const transits = arrayField(objectField(body, "route"), "transits")
    const plans = transits
      .slice(0, request.alternatives)
      .map((transit, rank) =>
        transitToPlan(transit, rank, request, fingerprint, this.now())
      )
      .filter((plan): plan is RoutePlan => Boolean(plan))
    if (!plans.length) {
      throw new RouteProviderError("NO_ROUTE", "未找到公共交通方案")
    }
    return { edgeId: request.edgeId, requestFingerprint: fingerprint, plans }
  }

  private setCommonParams(url: URL, request: RoutePlanRequest) {
    url.searchParams.set("key", this.key)
    url.searchParams.set("origin", formatEndpoint(request.origin))
    url.searchParams.set("destination", formatEndpoint(request.destination))
    if (request.origin.providerPlaceId) {
      url.searchParams.set(
        request.mode === "TRANSIT" ? "originpoi" : "origin_id",
        request.origin.providerPlaceId
      )
    }
    if (request.destination.providerPlaceId) {
      url.searchParams.set(
        request.mode === "TRANSIT" ? "destinationpoi" : "destination_id",
        request.destination.providerPlaceId
      )
    }
  }

  private async resolveCityCode(endpoint: RoutePlanEndpoint) {
    const url = new URL("https://restapi.amap.com/v3/geocode/regeo")
    url.searchParams.set("key", this.key)
    url.searchParams.set("location", formatEndpoint(endpoint))
    url.searchParams.set("extensions", "base")
    const body = await this.fetchJson(url)
    const component = objectField(
      objectField(body, "regeocode"),
      "addressComponent"
    )
    return stringField(component, "citycode")
  }

  private async fetchJson(url: URL): Promise<JsonRecord> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetcher(url, { signal: controller.signal })
      if (!response.ok) {
        throw new RouteProviderError(
          response.status === 429 ? "RATE_LIMIT" : "MALFORMED_RESPONSE",
          `高德路线服务返回 HTTP ${response.status}`
        )
      }
      const body = (await response.json()) as JsonRecord
      if (stringField(body, "status") !== "1") {
        const infoCode = stringField(body, "infocode")
        const info = stringField(body, "info") ?? "高德路线规划失败"
        if (
          infoCode === "10004" ||
          infoCode === "10005" ||
          infoCode === "10044"
        ) {
          throw new RouteProviderError(
            "AUTH_OR_QUOTA",
            infoCode === "10005"
              ? "高德 Web 服务 Key 未授权当前服务端 IP，请配置 IP 白名单"
              : info
          )
        }
        if (infoCode === "10003" || infoCode === "10020") {
          throw new RouteProviderError("RATE_LIMIT", info)
        }
        throw new RouteProviderError("MALFORMED_RESPONSE", info)
      }
      return body
    } catch (error) {
      if (error instanceof RouteProviderError) throw error
      if (error instanceof Error && error.name === "AbortError") {
        throw new RouteProviderError("TIMEOUT", "高德路线规划超时")
      }
      throw new RouteProviderError(
        "MALFORMED_RESPONSE",
        error instanceof Error ? error.message : "高德路线规划失败"
      )
    } finally {
      clearTimeout(timeout)
    }
  }
}

function roadPathToPlan(
  path: JsonRecord,
  rank: number,
  request: RoutePlanRequest,
  fingerprint: string,
  mode: "WALK" | "DRIVE",
  now: Date
): RoutePlan | null {
  const steps = arrayField(path, "steps")
  const positions = parseDirectionPolylines(
    steps.map((step) => stringField(step, "polyline") ?? "")
  )
  if (positions.length < 2) return null
  const trafficSections = steps.flatMap(parseTrafficSections)
  const cost = objectField(path, "cost")
  const durationSeconds =
    numberField(cost, "duration") ?? sumField(steps, "duration")
  const distanceMeters =
    numberField(path, "distance") ?? sumField(steps, "step_distance")
  const trafficBasis: RouteTrafficBasis =
    mode === "DRIVE" && trafficSections.length ? "REALTIME" : "TYPICAL"
  const segment: RouteSegment = {
    id: `${fingerprint}-${rank}-0`,
    order: 0,
    mode,
    fromName: request.origin.name,
    toName: request.destination.name,
    distanceMeters,
    durationSeconds,
    coordinateSystem: "GCJ02",
    geometryKind: "ROAD_NETWORK",
    positions,
    trafficSections: trafficSections.length ? trafficSections : undefined,
  }
  return {
    id: `${fingerprint}-${rank}`,
    provider: "amap",
    rank,
    label: rank === 0 ? "推荐路线" : `备选路线 ${rank}`,
    strategy: request.preference.toLowerCase(),
    distanceMeters,
    durationSeconds,
    fareAmount: numberField(cost, "tolls"),
    trafficBasis,
    calculatedAt: now.toISOString(),
    validUntil: new Date(
      now.getTime() + (trafficBasis === "REALTIME" ? 15 : 60) * 60_000
    ).toISOString(),
    requestFingerprint: fingerprint,
    segments: [segment],
  }
}

function transitToPlan(
  transit: JsonRecord,
  rank: number,
  request: RoutePlanRequest,
  fingerprint: string,
  now: Date
): RoutePlan | null {
  const segments = arrayField(transit, "segments").flatMap((segment) =>
    transitSegments(segment, fingerprint, rank)
  )
  segments.forEach((segment, order) => {
    segment.order = order
  })
  if (!segments.length) return null
  const cost = objectField(transit, "cost")
  return {
    id: `${fingerprint}-${rank}`,
    provider: "amap",
    rank,
    label: rank === 0 ? "推荐换乘" : `换乘方案 ${rank + 1}`,
    strategy: request.preference.toLowerCase(),
    distanceMeters:
      numberField(transit, "distance") ??
      sumOptional(segments, "distanceMeters"),
    durationSeconds:
      numberField(cost, "duration") ?? sumOptional(segments, "durationSeconds"),
    fareAmount:
      numberField(cost, "transit_fee") ?? numberField(transit, "transit_fee"),
    trafficBasis: "SCHEDULED",
    calculatedAt: now.toISOString(),
    validUntil: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
    requestFingerprint: fingerprint,
    segments,
  }
}

function transitSegments(
  container: JsonRecord,
  fingerprint: string,
  planRank: number
): RouteSegment[] {
  const result: RouteSegment[] = []
  const walking = objectField(container, "walking")
  const walkingSteps = arrayField(walking, "steps")
  const walkingPositions = parseDirectionPolylines(
    walkingSteps.map((step) => stringField(step, "polyline") ?? "")
  )
  if (walkingPositions.length >= 2) {
    result.push(
      segmentFromGeometry(
        "WALK",
        walkingPositions,
        walking,
        fingerprint,
        planRank,
        result.length,
        "ROAD_NETWORK"
      )
    )
  }

  const busLines = arrayField(objectField(container, "bus"), "buslines")
  for (const line of busLines) {
    const positions = parseDirectionPolylines([
      stringField(line, "polyline") ?? "",
    ])
    if (positions.length < 2) continue
    const name = stringField(line, "name")
    const mode: RouteSegmentMode = name?.includes("地铁") ? "SUBWAY" : "BUS"
    result.push({
      ...segmentFromGeometry(
        mode,
        positions,
        line,
        fingerprint,
        planRank,
        result.length,
        "TRANSIT_LINE"
      ),
      lineName: name,
      fromName: stopName(line, "departure_stop"),
      toName: stopName(line, "arrival_stop"),
    })
  }

  const railway = objectField(container, "railway")
  if (Object.keys(railway).length) {
    const positions = parseDirectionPolylines([
      stringField(railway, "polyline") ?? "",
    ])
    const endpoints = stationEndpointPositions(railway)
    result.push({
      ...segmentFromGeometry(
        "RAIL",
        positions.length >= 2 ? positions : endpoints,
        railway,
        fingerprint,
        planRank,
        result.length,
        positions.length >= 2 ? "TRANSIT_LINE" : "SCHEMATIC"
      ),
      lineName:
        stringField(railway, "trip") ?? stringField(railway, "name") ?? "铁路",
      fromName: stopName(railway, "departure_stop"),
      toName: stopName(railway, "arrival_stop"),
    })
  }

  const taxi = objectField(container, "taxi")
  const taxiPositions = parseDirectionPolylines([
    stringField(taxi, "polyline") ?? "",
  ])
  if (taxiPositions.length >= 2) {
    result.push({
      ...segmentFromGeometry(
        "TAXI",
        taxiPositions,
        taxi,
        fingerprint,
        planRank,
        result.length,
        "ROAD_NETWORK"
      ),
      fareAmount: numberField(taxi, "price"),
      fromName: stringField(taxi, "startname"),
      toName: stringField(taxi, "endname"),
    })
  }
  return result
}

function segmentFromGeometry(
  mode: RouteSegmentMode,
  positions: [number, number][],
  source: JsonRecord,
  fingerprint: string,
  planRank: number,
  index: number,
  geometryKind: RouteSegment["geometryKind"]
): RouteSegment {
  return {
    id: `${fingerprint}-${planRank}-${index}`,
    order: index,
    mode,
    distanceMeters:
      numberField(source, "distance") ?? numberField(source, "step_distance"),
    durationSeconds:
      numberField(source, "duration") ?? numberField(source, "drivetime"),
    coordinateSystem: "GCJ02",
    geometryKind: positions.length >= 2 ? geometryKind : "NONE",
    positions,
  }
}

function parseTrafficSections(step: JsonRecord): RouteTrafficSection[] {
  return arrayField(step, "tmcs")
    .map((tmc) => {
      const positions = parseDirectionPolylines([
        stringField(tmc, "tmc_polyline") ?? "",
      ])
      if (positions.length < 2) return null
      return {
        status: trafficStatus(stringField(tmc, "tmc_status")),
        positions,
      } satisfies RouteTrafficSection
    })
    .filter((section): section is RouteTrafficSection => Boolean(section))
}

function trafficStatus(status?: string): RouteTrafficSection["status"] {
  if (status === "畅通") return "FREE_FLOW"
  if (status === "缓行") return "SLOW"
  if (status === "拥堵") return "CONGESTED"
  if (status === "严重拥堵") return "SEVERE"
  return "UNKNOWN"
}

function drivingStrategy(request: RoutePlanRequest) {
  if (request.preference === "FASTEST") return "38"
  if (request.preference === "LOW_COST") return "36"
  return "32"
}

function transitStrategy(request: RoutePlanRequest) {
  if (request.preference === "FASTEST") return "8"
  if (request.preference === "LOW_COST") return "1"
  if (request.preference === "FEWER_TRANSFERS") return "2"
  if (request.preference === "LESS_WALKING") return "3"
  return "0"
}

function formatEndpoint(endpoint: RoutePlanEndpoint) {
  return `${endpoint.lng.toFixed(6)},${endpoint.lat.toFixed(6)}`
}

function dateParam(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function timeParam(date: Date) {
  return `${date.getHours()}-${String(date.getMinutes()).padStart(2, "0")}`
}

function objectField(value: unknown, key: string): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const nested = (value as JsonRecord)[key]
  return nested && typeof nested === "object" && !Array.isArray(nested)
    ? (nested as JsonRecord)
    : {}
}

function arrayField(value: unknown, key: string): JsonRecord[] {
  if (!value || typeof value !== "object") return []
  const nested = (value as JsonRecord)[key]
  return Array.isArray(nested)
    ? nested.filter(
        (item): item is JsonRecord =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item)
      )
    : []
}

function stringField(value: unknown, key: string) {
  if (!value || typeof value !== "object") return undefined
  const field = (value as JsonRecord)[key]
  return typeof field === "string" && field ? field : undefined
}

function numberField(value: unknown, key: string) {
  if (!value || typeof value !== "object") return undefined
  const field = (value as JsonRecord)[key]
  const parsed = typeof field === "number" ? field : Number(field)
  return Number.isFinite(parsed) ? parsed : undefined
}

function sumField(values: JsonRecord[], key: string) {
  return values.reduce((sum, value) => sum + (numberField(value, key) ?? 0), 0)
}

function sumOptional(
  values: RouteSegment[],
  key: "distanceMeters" | "durationSeconds"
) {
  return values.reduce((sum, value) => sum + (value[key] ?? 0), 0)
}

function stopName(value: JsonRecord, key: string) {
  return stringField(objectField(value, key), "name")
}

function stationEndpointPositions(railway: JsonRecord): [number, number][] {
  const fields = ["departure_stop", "arrival_stop"]
  return fields
    .map((field) => stringField(objectField(railway, field), "location"))
    .flatMap((location) =>
      location ? parseDirectionPolylines([location]) : []
    )
}
