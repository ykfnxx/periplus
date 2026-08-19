import type { TargetFlatJourneyEvent } from "@/modules/data-model/contracts"

type FlatTransitEvent = Extract<TargetFlatJourneyEvent, { kind: "TRANSIT" }>

export type RouteTrafficStatus =
  | "UNKNOWN"
  | "FREE_FLOW"
  | "SLOW"
  | "CONGESTED"
  | "SEVERE"

export type RouteLineStyle =
  | "solid"
  | "dashed"
  | "dashed-long-direction"
  | "dashed-short-direction"

export interface RouteRevisionTransit {
  eventId: string
  transportMode: FlatTransitEvent["detail"]["transportMode"]
  routeState: FlatTransitEvent["detail"]["routeState"]
  route?: FlatTransitEvent["detail"]["route"]
  from?: { lng: number; lat: number }
  to?: { lng: number; lat: number }
}

export interface RouteWorkerRevisionInput {
  transits: RouteRevisionTransit[]
}

export interface RouteViewportQuery {
  zoom: number
  viewLevel: "overview" | "section"
  bounds: { west: number; south: number; east: number; north: number }
  visibleEventIds: string[]
  selectedTransitEventId: string | null
}

export type RouteWorkerRequest =
  | {
      type: "route.revision.replace"
      revisionKey: string
      source: RouteWorkerRevisionInput
    }
  | {
      type: "route.viewport.query"
      revisionKey: string
      queryId: number
      input: RouteViewportQuery
    }
  | { type: "route.dispose" }

export interface PackedRouteLine {
  key: string
  eventId: string
  kind: "base" | "traffic"
  status?: RouteTrafficStatus
  style: RouteLineStyle
  routeStale: boolean
  selected: boolean
  dimmed: boolean
  coordinates: Float64Array
  partOffsets: Uint32Array
}

export interface RouteTransferPoint {
  key: string
  eventId: string
  lng: number
  lat: number
}

export interface PackedRouteRenderModel {
  lines: PackedRouteLine[]
  transfers: RouteTransferPoint[]
}

export type RouteWorkerResponse =
  | {
      type: "route.revision.ready"
      revisionKey: string
      metrics: {
        rawSectionCount: number
        mergedRunCount: number
        sourceFeatureCount: number
        rawVertexCount: number
        tileIndexBuildMs: number
      }
    }
  | {
      type: "route.viewport.ready"
      revisionKey: string
      queryId: number
      model: PackedRouteRenderModel
      metrics: {
        queriedTileCount: number
        tileFeatureCount: number
        decodedVertexCount: number
        tileQueryMs: number
      }
    }
  | {
      type: "route.worker.failed"
      revisionKey: string
      queryId?: number
      message: string
    }
