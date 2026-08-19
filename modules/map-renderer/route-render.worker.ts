import geojsonvt from "geojson-vt"
import type { Feature, FeatureCollection, MultiLineString } from "geojson"
import { getEdgePathPositions } from "@/lib/journeys/transit-geometry"
import type {
  PackedRouteLine,
  RouteLineStyle,
  RouteTrafficStatus,
  RouteTransferPoint,
  RouteViewportQuery,
  RouteWorkerRequest,
  RouteWorkerResponse,
  RouteWorkerRevisionInput,
} from "./route-worker-protocol"

const TILE_EXTENT = 4096
const MAX_TILE_ZOOM = 18
const MAX_MERCATOR_LAT = 85.05112878
const TRAFFIC_JOIN_METERS = 5

interface RouteFeatureProperties {
  renderKey: string
  eventId: string
  kind: "base" | "traffic"
  status?: RouteTrafficStatus
  style: RouteLineStyle
  routeStale: boolean
}

interface RouteIndexMetrics {
  rawSectionCount: number
  mergedRunCount: number
  sourceFeatureCount: number
  rawVertexCount: number
  tileIndexBuildMs: number
}

interface WorkerPort {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<RouteWorkerRequest>) => void
  ): void
  postMessage(message: RouteWorkerResponse, transfer?: Transferable[]): void
  close(): void
}

type RouteTileFeature = {
  geometry: number[][]
  tags?: RouteFeatureProperties
}

let revisionKey: string | null = null
let routeIndex: ReturnType<typeof geojsonvt> | null = null
let transferPointsByEvent = new Map<string, RouteTransferPoint[]>()
const workerPort = self as unknown as WorkerPort

workerPort.addEventListener("message", (event) => {
  const request = event.data
  if (request.type === "route.dispose") {
    routeIndex = null
    transferPointsByEvent.clear()
    workerPort.close()
    return
  }

  try {
    if (request.type === "route.revision.replace") {
      replaceRevision(request.revisionKey, request.source)
      return
    }
    queryViewport(request.revisionKey, request.queryId, request.input)
  } catch (error) {
    workerPort.postMessage({
      type: "route.worker.failed",
      revisionKey: request.revisionKey,
      ...(request.type === "route.viewport.query"
        ? { queryId: request.queryId }
        : {}),
      message: error instanceof Error ? error.message : "Route Worker failed",
    })
  }
})

function replaceRevision(key: string, source: RouteWorkerRevisionInput) {
  const startedAt = performance.now()
  const built = buildFeatureCollection(source)
  routeIndex = geojsonvt(built.collection, {
    maxZoom: MAX_TILE_ZOOM,
    tolerance: 3,
    extent: TILE_EXTENT,
    buffer: 0,
    lineMetrics: false,
    promoteId: "renderKey",
    generateId: false,
    indexMaxZoom: 5,
    indexMaxPoints: 100_000,
  })
  revisionKey = key
  transferPointsByEvent = built.transferPointsByEvent
  const metrics: RouteIndexMetrics = {
    ...built.metrics,
    sourceFeatureCount: built.collection.features.length,
    tileIndexBuildMs: performance.now() - startedAt,
  }
  workerPort.postMessage({
    type: "route.revision.ready",
    revisionKey: key,
    metrics,
  })
}

function buildFeatureCollection(source: RouteWorkerRevisionInput) {
  const features: Array<Feature<MultiLineString, RouteFeatureProperties>> = []
  const transfers = new Map<string, RouteTransferPoint[]>()
  let rawSectionCount = 0
  let mergedRunCount = 0
  let rawVertexCount = 0

  for (const transit of source.transits) {
    const baseByStyle = new Map<RouteLineStyle, Array<[number, number][]>>()
    const trafficByStatus = new Map<
      RouteTrafficStatus,
      Array<[number, number][]>
    >()
    const segments = transit.route?.segments ?? []

    for (const [segmentIndex, segment] of segments.entries()) {
      if (segment.positions.length >= 2) {
        const style = routeLineStyle(
          segment.mode,
          segment.geometryKind === "SCHEMATIC"
        )
        const lines = baseByStyle.get(style) ?? []
        lines.push(segment.positions)
        baseByStyle.set(style, lines)
        rawVertexCount += segment.positions.length
      }

      if (segmentIndex > 0 && segment.positions[0]) {
        const points = transfers.get(transit.eventId) ?? []
        points.push({
          key: `transfer:${transit.eventId}:${segmentIndex}`,
          eventId: transit.eventId,
          lng: segment.positions[0][0],
          lat: segment.positions[0][1],
        })
        transfers.set(transit.eventId, points)
      }

      const trafficSections = segment.trafficSections ?? []
      rawSectionCount += trafficSections.length
      rawVertexCount += trafficSections.reduce(
        (total, section) => total + section.positions.length,
        0
      )
      for (const run of mergeTrafficSections(trafficSections)) {
        const lines = trafficByStatus.get(run.status) ?? []
        lines.push(run.positions)
        trafficByStatus.set(run.status, lines)
        mergedRunCount += 1
      }
    }

    if (baseByStyle.size === 0 && transit.from && transit.to) {
      baseByStyle.set("dashed", [
        getEdgePathPositions(transit.from, transit.to, transit.transportMode),
      ])
    }

    for (const [style, lines] of baseByStyle) {
      features.push(
        routeFeature(`base:${transit.eventId}:${style}`, lines, {
          eventId: transit.eventId,
          kind: "base",
          style,
          routeStale: transit.routeState === "ROUTE_STALE",
        })
      )
    }
    for (const [status, lines] of trafficByStatus) {
      features.push(
        routeFeature(`traffic:${transit.eventId}:${status}`, lines, {
          eventId: transit.eventId,
          kind: "traffic",
          status,
          style: "solid",
          routeStale: false,
        })
      )
    }
  }

  return {
    collection: {
      type: "FeatureCollection",
      features,
    } satisfies FeatureCollection<MultiLineString, RouteFeatureProperties>,
    transferPointsByEvent: transfers,
    metrics: { rawSectionCount, mergedRunCount, rawVertexCount },
  }
}

function routeFeature(
  renderKey: string,
  coordinates: Array<[number, number][]>,
  properties: Omit<RouteFeatureProperties, "renderKey">
): Feature<MultiLineString, RouteFeatureProperties> {
  return {
    type: "Feature",
    properties: { renderKey, ...properties },
    geometry: { type: "MultiLineString", coordinates },
  }
}

function routeLineStyle(mode: string, schematic: boolean): RouteLineStyle {
  if (schematic) return "dashed"
  if (mode === "WALK") return "dashed-short-direction"
  if (mode === "FLIGHT") return "dashed-long-direction"
  return "solid"
}

function mergeTrafficSections(
  sections: Array<{
    status: RouteTrafficStatus
    positions: Array<[number, number]>
  }>
) {
  const runs: Array<{
    status: RouteTrafficStatus
    positions: Array<[number, number]>
  }> = []
  for (const section of sections) {
    if (section.positions.length < 2) continue
    const current = runs[runs.length - 1]
    if (
      current?.status === section.status &&
      endpointDistanceMeters(
        current.positions[current.positions.length - 1]!,
        section.positions[0]!
      ) <= TRAFFIC_JOIN_METERS
    ) {
      current.positions.push(...section.positions.slice(1))
      continue
    }
    runs.push({ status: section.status, positions: [...section.positions] })
  }
  return runs
}

function endpointDistanceMeters(
  left: [number, number],
  right: [number, number]
) {
  const latitudeRadians = ((left[1] + right[1]) * Math.PI) / 360
  const x = (((right[0] - left[0]) * Math.PI) / 180) * Math.cos(latitudeRadians)
  const y = ((right[1] - left[1]) * Math.PI) / 180
  return Math.hypot(x, y) * 6_371_000
}

function queryViewport(
  key: string,
  queryId: number,
  query: RouteViewportQuery
) {
  if (!routeIndex || revisionKey !== key) return
  const startedAt = performance.now()
  const visibleEventIds = new Set(query.visibleEventIds)
  const partsByKey = new Map<
    string,
    {
      properties: RouteFeatureProperties
      parts: Array<Array<[number, number]>>
    }
  >()
  const tiles = visibleTiles(query)
  let tileFeatureCount = 0

  for (const { z, x, y } of tiles) {
    const tile = routeIndex.getTile(z, x, y)
    if (!tile) continue
    for (const feature of tile.features as unknown as RouteTileFeature[]) {
      const properties = feature.tags
      if (!properties || !visibleEventIds.has(properties.eventId)) continue
      const selected = query.selectedTransitEventId === properties.eventId
      if (
        properties.kind === "traffic" &&
        (query.viewLevel === "overview" || query.zoom < 14 || !selected)
      ) {
        continue
      }
      tileFeatureCount += 1
      const group = partsByKey.get(properties.renderKey) ?? {
        properties,
        parts: [],
      }
      for (const geometry of feature.geometry) {
        const decoded = decodeTileLine(geometry, z, x, y)
        if (decoded.length >= 2) group.parts.push(decoded)
      }
      partsByKey.set(properties.renderKey, group)
    }
  }

  const lines: PackedRouteLine[] = []
  let decodedVertexCount = 0
  for (const [renderKey, group] of partsByKey) {
    const pointCount = group.parts.reduce(
      (total, part) => total + part.length,
      0
    )
    if (pointCount < 2) continue
    const coordinates = new Float64Array(pointCount * 2)
    const partOffsets = new Uint32Array(group.parts.length)
    let pointIndex = 0
    for (const [partIndex, part] of group.parts.entries()) {
      for (const [lng, lat] of part) {
        coordinates[pointIndex * 2] = lng
        coordinates[pointIndex * 2 + 1] = lat
        pointIndex += 1
      }
      partOffsets[partIndex] = pointIndex
    }
    decodedVertexCount += pointCount
    const selected = query.selectedTransitEventId === group.properties.eventId
    lines.push({
      key: renderKey,
      eventId: group.properties.eventId,
      kind: group.properties.kind,
      ...(group.properties.status ? { status: group.properties.status } : {}),
      style: group.properties.style,
      routeStale: group.properties.routeStale,
      selected,
      dimmed: query.selectedTransitEventId !== null && !selected,
      coordinates,
      partOffsets,
    })
  }

  const transfers =
    query.selectedTransitEventId && query.viewLevel !== "overview"
      ? (transferPointsByEvent.get(query.selectedTransitEventId) ?? [])
      : []
  const response: RouteWorkerResponse = {
    type: "route.viewport.ready",
    revisionKey: key,
    queryId,
    model: { lines, transfers },
    metrics: {
      queriedTileCount: tiles.length,
      tileFeatureCount,
      decodedVertexCount,
      tileQueryMs: performance.now() - startedAt,
    },
  }
  workerPort.postMessage(
    response,
    lines.flatMap((line) => [line.coordinates.buffer, line.partOffsets.buffer])
  )
}

function visibleTiles(query: RouteViewportQuery) {
  const z = Math.min(Math.floor(query.zoom), MAX_TILE_ZOOM)
  const dimension = 2 ** z
  const southY = tileY(query.bounds.south, dimension)
  const northY = tileY(query.bounds.north, dimension)
  const yStart = Math.max(0, Math.min(northY, southY) - 1)
  const yEnd = Math.min(dimension - 1, Math.max(northY, southY) + 1)
  const xRanges =
    query.bounds.west <= query.bounds.east
      ? [
          [
            tileX(query.bounds.west, dimension),
            tileX(query.bounds.east, dimension),
          ],
        ]
      : [
          [tileX(query.bounds.west, dimension), dimension - 1],
          [0, tileX(query.bounds.east, dimension)],
        ]
  const keys = new Set<string>()
  const tiles: Array<{ z: number; x: number; y: number }> = []

  for (const [rangeStart, rangeEnd] of xRanges) {
    for (let rawX = rangeStart - 1; rawX <= rangeEnd + 1; rawX += 1) {
      const x = (rawX + dimension) % dimension
      for (let y = yStart; y <= yEnd; y += 1) {
        const key = `${x}:${y}`
        if (keys.has(key)) continue
        keys.add(key)
        tiles.push({ z, x, y })
      }
    }
  }
  return tiles
}

function tileX(longitude: number, dimension: number) {
  return Math.min(
    dimension - 1,
    Math.max(0, Math.floor(((longitude + 180) / 360) * dimension))
  )
}

function tileY(latitude: number, dimension: number) {
  const clamped = Math.max(
    -MAX_MERCATOR_LAT,
    Math.min(MAX_MERCATOR_LAT, latitude)
  )
  const radians = (clamped * Math.PI) / 180
  const projected =
    (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2
  return Math.min(dimension - 1, Math.max(0, Math.floor(projected * dimension)))
}

function decodeTileLine(geometry: number[], z: number, x: number, y: number) {
  const dimension = 2 ** z
  const positions: Array<[number, number]> = []
  for (let index = 0; index < geometry.length; index += 2) {
    const worldX = (x + geometry[index]! / TILE_EXTENT) / dimension
    const worldY = (y + geometry[index + 1]! / TILE_EXTENT) / dimension
    positions.push([
      worldX * 360 - 180,
      (Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY))) * 180) / Math.PI,
    ])
  }
  return positions
}
