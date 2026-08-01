import { periplusServerConfig } from "@/config/periplus.server"
import {
  buildSmoothSchematicPath,
  parseDirectionPolylines,
  type LngLatTuple,
} from "@/lib/journeys/transit-geometry"
import { endpointToGcj02 } from "@/lib/journeys/coordinates"
import {
  transitPlanFingerprint,
  type TransitPlan,
  type TransitPlanBundle,
  type TransitPlanEndpoint,
  type TransitPlanRequest,
  type TransitProviderErrorCode,
  type TransitSegment,
  type TransitSegmentMode,
  type TransitTrafficBasis,
  type TransitTrafficSection,
} from "@/lib/journeys/planning"

type JsonRecord = Record<string, unknown>

const DEFAULT_REQUEST_INTERVAL_MS = 250
const AUTH_OR_QUOTA_INFO_CODES = new Set([
  "10001",
  "10002",
  "10003",
  "10005",
  "10009",
  "10010",
  "10012",
  "10013",
  "10026",
  "10041",
  "10044",
  "10045",
  "40000",
  "40002",
  "40003",
])
const RATE_LIMIT_INFO_CODES = new Set([
  "10004",
  "10014",
  "10015",
  "10016",
  "10019",
  "10020",
  "10021",
  "10029",
])

interface RailStop {
  name?: string
  position: LngLatTuple
}

export class TransitProviderError extends Error {
  constructor(
    public readonly code: TransitProviderErrorCode,
    message: string
  ) {
    super(message)
    this.name = "TransitProviderError"
  }
}

interface AMapTransitProviderOptions {
  key?: string
  fetcher?: typeof fetch
  now?: () => Date
  requestIntervalMs?: number
  sleep?: (milliseconds: number) => Promise<void>
  timeoutMs?: number
}

export class AMapTransitProvider {
  private readonly key: string
  private readonly fetcher: typeof fetch
  private readonly now: () => Date
  private readonly requestIntervalMs: number
  private readonly sleep: (milliseconds: number) => Promise<void>
  private readonly timeoutMs: number
  private requestQueue: Promise<void> = Promise.resolve()
  private hasStartedRequest = false

  constructor(options: AMapTransitProviderOptions = {}) {
    this.key = options.key ?? periplusServerConfig.amap.webServiceKey
    this.fetcher = options.fetcher ?? fetch
    this.now = options.now ?? (() => new Date())
    // 高德按账号和接口限制 QPS；所有实际 Web 服务调用共用一个节流队列。
    this.requestIntervalMs =
      options.requestIntervalMs ??
      (options.fetcher ? 0 : DEFAULT_REQUEST_INTERVAL_MS)
    this.sleep =
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => setTimeout(resolve, milliseconds)))
    this.timeoutMs = options.timeoutMs ?? 7000
  }

  async plan(input: TransitPlanRequest): Promise<TransitPlanBundle> {
    if (!this.key) {
      throw new TransitProviderError(
        "AUTH_OR_QUOTA",
        "缺少 PERIPLUS_AMAP_WEB_SERVICE_KEY"
      )
    }
    const request = {
      ...input,
      origin: endpointToGcj02(input.origin),
      destination: endpointToGcj02(input.destination),
    }
    const fingerprint = transitPlanFingerprint(request)

    if (request.mode === "TRANSIT") {
      return this.planTransit(request, fingerprint)
    }
    return this.planRoad(request, fingerprint)
  }

  private async planRoad(request: TransitPlanRequest, fingerprint: string) {
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
      .filter((plan): plan is TransitPlan => Boolean(plan))
    if (!plans.length)
      throw new TransitProviderError("NO_ROUTE", "未找到可用路线")

    const futureDrive =
      request.mode === "DRIVE" &&
      request.departAt &&
      new Date(request.departAt).getTime() > this.now().getTime() + 15 * 60_000
    return {
      transitEventId: request.transitEventId,
      requestFingerprint: fingerprint,
      plans,
      warning: futureDrive
        ? "高德普通驾车接口不支持未来出发时刻，当前展示常规预计耗时"
        : undefined,
    }
  }

  private async planTransit(request: TransitPlanRequest, fingerprint: string) {
    const originCity =
      request.origin.cityCode ?? (await this.resolveCityCode(request.origin))
    const destinationCity =
      request.destination.cityCode ??
      (await this.resolveCityCode(request.destination))
    if (!originCity || !destinationCity) {
      throw new TransitProviderError(
        "INVALID_ENDPOINT",
        "公共交通规划需要起终点 citycode"
      )
    }

    const railwayRequest = request.transportMode === "TRAIN"
    const url = new URL(
      railwayRequest
        ? "https://restapi.amap.com/v3/direction/transit/integrated"
        : "https://restapi.amap.com/v5/direction/transit/integrated"
    )
    this.setCommonParams(url, request, !railwayRequest)
    if (railwayRequest) {
      // v3 的 extensions=all 会返回铁路途经站；v5 当前只返回始发和到达站。
      url.searchParams.set("city", originCity)
      url.searchParams.set("cityd", destinationCity)
      url.searchParams.set("strategy", legacyTransitStrategy(request))
      url.searchParams.set("extensions", "all")
    } else {
      url.searchParams.set("city1", originCity)
      url.searchParams.set("city2", destinationCity)
      url.searchParams.set("strategy", transitStrategy(request))
      url.searchParams.set(
        "AlternativeRoute",
        String(Math.max(1, Math.min(request.alternatives, 10)))
      )
      url.searchParams.set("show_fields", "cost,polyline")
    }
    const departAt = request.departAt ? new Date(request.departAt) : null
    if (departAt && !Number.isNaN(departAt.getTime())) {
      url.searchParams.set("date", dateParam(departAt))
      url.searchParams.set(
        "time",
        railwayRequest ? legacyTimeParam(departAt) : timeParam(departAt)
      )
    }

    const body = await this.fetchJson(url)
    const transits = arrayField(objectField(body, "route"), "transits")
    const matchingTransits = railwayRequest
      ? transits.filter(hasRailwaySegment)
      : transits
    const railCorridor = preferredRailCorridor(matchingTransits)
    const plans = matchingTransits
      .slice(0, request.alternatives)
      .map((transit, rank) =>
        transitToPlan(
          transit,
          rank,
          request,
          fingerprint,
          this.now(),
          railCorridor
        )
      )
      .filter((plan): plan is TransitPlan => Boolean(plan))
    if (!plans.length) {
      throw new TransitProviderError(
        "NO_ROUTE",
        railwayRequest ? "未找到火车方案" : "未找到公共交通方案"
      )
    }
    return {
      transitEventId: request.transitEventId,
      requestFingerprint: fingerprint,
      plans,
    }
  }

  private setCommonParams(
    url: URL,
    request: TransitPlanRequest,
    includeProviderPlaceIds = true
  ) {
    url.searchParams.set("key", this.key)
    url.searchParams.set("origin", formatEndpoint(request.origin))
    url.searchParams.set("destination", formatEndpoint(request.destination))
    if (!includeProviderPlaceIds) return
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

  private async resolveCityCode(endpoint: TransitPlanEndpoint) {
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

  private fetchJson(url: URL): Promise<JsonRecord> {
    const pending = this.requestQueue.then(async () => {
      if (this.hasStartedRequest && this.requestIntervalMs > 0) {
        await this.sleep(this.requestIntervalMs)
      }
      this.hasStartedRequest = true
      return this.fetchJsonImmediately(url)
    })
    this.requestQueue = pending.then(
      () => undefined,
      () => undefined
    )
    return pending
  }

  private async fetchJsonImmediately(url: URL): Promise<JsonRecord> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetcher(url, { signal: controller.signal })
      if (!response.ok) {
        throw new TransitProviderError(
          response.status === 429 ? "RATE_LIMIT" : "MALFORMED_RESPONSE",
          `高德路线服务返回 HTTP ${response.status}`
        )
      }
      const body = (await response.json()) as JsonRecord
      if (stringField(body, "status") !== "1") {
        const infoCode = stringField(body, "infocode")
        const info = stringField(body, "info") ?? "高德路线规划失败"
        if (infoCode && AUTH_OR_QUOTA_INFO_CODES.has(infoCode)) {
          throw new TransitProviderError(
            "AUTH_OR_QUOTA",
            infoCode === "10005"
              ? "高德 Web 服务 Key 未授权当前服务端 IP，请配置 IP 白名单"
              : info
          )
        }
        if (infoCode && RATE_LIMIT_INFO_CODES.has(infoCode)) {
          throw new TransitProviderError(
            "RATE_LIMIT",
            "高德路线服务请求过快，请稍后重试"
          )
        }
        throw new TransitProviderError("MALFORMED_RESPONSE", info)
      }
      return body
    } catch (error) {
      if (error instanceof TransitProviderError) throw error
      if (error instanceof Error && error.name === "AbortError") {
        throw new TransitProviderError("TIMEOUT", "高德路线规划超时")
      }
      throw new TransitProviderError(
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
  request: TransitPlanRequest,
  fingerprint: string,
  mode: "WALK" | "DRIVE",
  now: Date
): TransitPlan | null {
  const steps = arrayField(path, "steps")
  const positions = parseDirectionPolylines(
    steps.map((step) => polylineField(step) ?? "")
  )
  if (positions.length < 2) return null
  const trafficSections = steps.flatMap(parseTrafficSections)
  const cost = objectField(path, "cost")
  const durationSeconds =
    numberField(cost, "duration") ?? sumField(steps, "duration")
  const distanceMeters =
    numberField(path, "distance") ?? sumField(steps, "step_distance")
  const trafficBasis: TransitTrafficBasis =
    mode === "DRIVE" && trafficSections.length ? "REALTIME" : "TYPICAL"
  const segment: TransitSegment = {
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
  request: TransitPlanRequest,
  fingerprint: string,
  now: Date,
  railCorridor: RailStop[]
): TransitPlan | null {
  const segments = arrayField(transit, "segments").flatMap((segment) =>
    transitSegments(segment, fingerprint, rank, railCorridor)
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
    label:
      rank === 0
        ? request.transportMode === "TRAIN"
          ? "推荐火车"
          : "推荐换乘"
        : `换乘方案 ${rank + 1}`,
    strategy: request.preference.toLowerCase(),
    distanceMeters:
      numberField(transit, "distance") ??
      sumOptional(segments, "distanceMeters"),
    durationSeconds:
      numberField(cost, "duration") ??
      numberField(transit, "duration") ??
      sumOptional(segments, "durationSeconds"),
    fareAmount:
      numberField(cost, "transit_fee") ??
      numberField(transit, "transit_fee") ??
      numberField(transit, "cost"),
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
  planRank: number,
  railCorridor: RailStop[]
): TransitSegment[] {
  const result: TransitSegment[] = []
  const walking = objectField(container, "walking")
  const walkingSteps = arrayField(walking, "steps")
  const walkingPositions = parseDirectionPolylines(
    walkingSteps.map((step) => polylineField(step) ?? "")
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
    const positions = parseDirectionPolylines([polylineField(line) ?? ""])
    if (positions.length < 2) continue
    const name = stringField(line, "name")
    const mode: TransitSegmentMode = name?.includes("地铁") ? "SUBWAY" : "BUS"
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
    const providerPositions = parseDirectionPolylines([
      polylineField(railway) ?? "",
    ])
    const railStops = stationRouteStops(railway)
    const schematicStops = corridorStopsForSegment(railStops, railCorridor)
    const positions =
      providerPositions.length >= 2
        ? providerPositions
        : buildSmoothSchematicPath(schematicStops.map((stop) => stop.position))
    if (positions.length >= 2) {
      result.push({
        ...segmentFromGeometry(
          "RAIL",
          positions,
          railway,
          fingerprint,
          planRank,
          result.length,
          providerPositions.length >= 2 ? "TRANSIT_LINE" : "SCHEMATIC"
        ),
        lineName:
          stringField(railway, "trip") ??
          stringField(railway, "name") ??
          "铁路",
        fromName: stopName(railway, "departure_stop"),
        toName: stopName(railway, "arrival_stop"),
      })
    }
  }

  const taxi = objectField(container, "taxi")
  const taxiPositions = parseDirectionPolylines([polylineField(taxi) ?? ""])
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
  mode: TransitSegmentMode,
  positions: [number, number][],
  source: JsonRecord,
  fingerprint: string,
  planRank: number,
  index: number,
  geometryKind: TransitSegment["geometryKind"]
): TransitSegment {
  return {
    id: `${fingerprint}-${planRank}-${index}`,
    order: index,
    mode,
    distanceMeters:
      numberField(source, "distance") ?? numberField(source, "step_distance"),
    durationSeconds:
      numberField(source, "duration") ??
      numberField(source, "drivetime") ??
      numberField(source, "time"),
    coordinateSystem: "GCJ02",
    geometryKind: positions.length >= 2 ? geometryKind : "NONE",
    positions,
  }
}

function parseTrafficSections(step: JsonRecord): TransitTrafficSection[] {
  return arrayField(step, "tmcs")
    .map((tmc) => {
      const positions = parseDirectionPolylines([
        stringField(tmc, "tmc_polyline") ?? "",
      ])
      if (positions.length < 2) return null
      return {
        status: trafficStatus(stringField(tmc, "tmc_status")),
        positions,
      } satisfies TransitTrafficSection
    })
    .filter((section): section is TransitTrafficSection => Boolean(section))
}

function trafficStatus(status?: string): TransitTrafficSection["status"] {
  if (status === "畅通") return "FREE_FLOW"
  if (status === "缓行") return "SLOW"
  if (status === "拥堵") return "CONGESTED"
  if (status === "严重拥堵") return "SEVERE"
  return "UNKNOWN"
}

function drivingStrategy(request: TransitPlanRequest) {
  if (request.preference === "FASTEST") return "38"
  if (request.preference === "LOW_COST") return "36"
  return "32"
}

function transitStrategy(request: TransitPlanRequest) {
  if (request.preference === "FASTEST") return "8"
  if (request.preference === "LOW_COST") return "1"
  if (request.preference === "FEWER_TRANSFERS") return "2"
  if (request.preference === "LESS_WALKING") return "3"
  return "0"
}

function legacyTransitStrategy(request: TransitPlanRequest) {
  if (request.preference === "LOW_COST") return "1"
  if (request.preference === "FEWER_TRANSFERS") return "2"
  if (request.preference === "LESS_WALKING") return "3"
  return "0"
}

function formatEndpoint(endpoint: TransitPlanEndpoint) {
  return `${endpoint.lng.toFixed(6)},${endpoint.lat.toFixed(6)}`
}

function dateParam(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function timeParam(date: Date) {
  return `${date.getHours()}-${String(date.getMinutes()).padStart(2, "0")}`
}

function legacyTimeParam(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
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

function polylineField(value: unknown) {
  return (
    stringField(value, "polyline") ??
    stringField(objectField(value, "polyline"), "polyline")
  )
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
  values: TransitSegment[],
  key: "distanceMeters" | "durationSeconds"
) {
  return values.reduce((sum, value) => sum + (value[key] ?? 0), 0)
}

function stopName(value: JsonRecord, key: string) {
  return stringField(objectField(value, key), "name")
}

function preferredRailCorridor(transits: JsonRecord[]): RailStop[] {
  return transits.reduce<RailStop[]>((preferred, transit) => {
    const candidate = arrayField(transit, "segments")
      .flatMap((segment) => stationRouteStops(objectField(segment, "railway")))
      .filter(
        (stop, index, stops) =>
          index === 0 || !sameRailStop(stop, stops[index - 1])
      )
    return candidate.length > preferred.length ? candidate : preferred
  }, [])
}

function hasRailwaySegment(transit: JsonRecord) {
  return arrayField(transit, "segments").some((segment) => {
    const railway = objectField(segment, "railway")
    return (
      stationRouteStops(railway).length >= 2 &&
      Boolean(stringField(railway, "trip") ?? stringField(railway, "name"))
    )
  })
}

function stationRouteStops(railway: JsonRecord): RailStop[] {
  const departure = stationStop(objectField(railway, "departure_stop"))
  const arrival = stationStop(objectField(railway, "arrival_stop"))
  const viaStops = [
    ...arrayField(railway, "via_stops"),
    ...arrayField(railway, "via_stop"),
  ]
    .map(stationStop)
    .filter((stop): stop is RailStop => Boolean(stop))
  return [departure, ...viaStops, arrival]
    .filter((stop): stop is RailStop => Boolean(stop))
    .filter(
      (stop, index, stops) =>
        index === 0 || !sameRailStop(stop, stops[index - 1])
    )
}

function stationStop(value: JsonRecord): RailStop | null {
  const location = stringField(value, "location")
  if (!location) return null
  // v3 的始发/到达站可能用空格分隔，途经站则常用逗号分隔。
  const [lngRaw, latRaw] = location.trim().split(/[,\s]+/)
  const lng = Number(lngRaw)
  const lat = Number(latRaw)
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null
  return {
    name: stringField(value, "name"),
    position: [lng, lat],
  }
}

function corridorStopsForSegment(
  segmentStops: RailStop[],
  corridor: RailStop[]
): RailStop[] {
  if (segmentStops.length !== 2 || corridor.length <= 2) return segmentStops
  const start = corridor.findIndex((stop) =>
    sameRailStop(stop, segmentStops[0])
  )
  const end = corridor.findLastIndex((stop) =>
    sameRailStop(stop, segmentStops[1])
  )
  if (start >= 0 && end > start) return corridor.slice(start, end + 1)
  if (end >= 0 && start > end) {
    return corridor.slice(end, start + 1).reverse()
  }
  return segmentStops
}

function sameRailStop(left: RailStop, right: RailStop) {
  const coordinateDistance = Math.hypot(
    left.position[0] - right.position[0],
    left.position[1] - right.position[1]
  )
  if (coordinateDistance <= 0.002) return true
  if (!left.name || !right.name) return false
  return normalizeStationName(left.name) === normalizeStationName(right.name)
}

function normalizeStationName(name: string) {
  return name.trim().replace(/站$/, "")
}
