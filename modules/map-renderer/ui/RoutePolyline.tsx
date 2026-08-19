"use client"

import { useEffect, useMemo, useRef } from "react"
import { getJourneyScopeProjection } from "@/lib/journeys/projections"
import { periplusColors, trafficSectionColors } from "@/lib/ui/map-theme"
import type {
  TargetFlatJourneyEvent,
  TargetFlatJourneySnapshot,
} from "@/modules/data-model/contracts"
import type { MapIntent } from "@/modules/workspace/contracts"
import { selectWorkspaceJourneyView } from "@/modules/workspace/state/selectors"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type {
  PackedRouteLine,
  PackedRouteRenderModel,
  RouteRevisionTransit,
  RouteViewportQuery,
  RouteWorkerResponse,
} from "../route-worker-protocol"

type FlatLocationEvent = Exclude<TargetFlatJourneyEvent, { kind: "TRANSIT" }>

export default function RoutePolyline({
  onIntent,
}: {
  onIntent?: (intent: MapIntent) => void
}) {
  const map = useWorkspaceStore((state) => state.map)
  const flatJourney = useWorkspaceStore(
    (state) => state.workspaceDocument?.session.flatJourney ?? null
  )
  const graph = useWorkspaceStore(selectWorkspaceJourneyView)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeSectionEventId = useWorkspaceStore(
    (state) => state.activeSectionEventId
  )
  const selectedTransitEventId = useWorkspaceStore(
    (state) => state.selectedTransitEventId
  )
  const setRouteRenderedRevisionKey = useWorkspaceStore(
    (state) => state.setRouteRenderedRevisionKey
  )
  const onIntentRef = useRef(onIntent)
  const coordinatorRef = useRef<RouteRenderCoordinator | null>(null)
  const visibleTransitEventIds = useMemo(
    () =>
      graph
        ? getJourneyScopeProjection(
            graph,
            viewLevel,
            activeSectionEventId
          ).transits.map((event) => event.id)
        : [],
    [activeSectionEventId, graph, viewLevel]
  )

  useEffect(() => {
    onIntentRef.current = onIntent
  }, [onIntent])

  useEffect(() => {
    const coordinator = new RouteRenderCoordinator(
      onIntentRef,
      setRouteRenderedRevisionKey
    )
    coordinatorRef.current = coordinator
    return () => {
      coordinatorRef.current = null
      coordinator.dispose()
    }
  }, [setRouteRenderedRevisionKey])

  useEffect(() => {
    coordinatorRef.current?.setMap(map)
  }, [map])

  useEffect(() => {
    coordinatorRef.current?.setRevision(flatJourney)
  }, [flatJourney])

  useEffect(() => {
    coordinatorRef.current?.setView({
      viewLevel,
      visibleEventIds: visibleTransitEventIds,
      selectedTransitEventId,
    })
  }, [selectedTransitEventId, viewLevel, visibleTransitEventIds])

  return null
}

class RouteRenderCoordinator {
  private readonly worker = new Worker(
    new URL("../route-render.worker.ts", import.meta.url),
    { type: "module" }
  )
  private map: AMap.Map | null = null
  private manager: RouteLayerManager | null = null
  private revisionKey: string | null = null
  private indexReady = false
  private querySequence = 0
  private viewportVersion = 0
  private inFlight: {
    revisionKey: string
    queryId: number
    viewportVersion: number
  } | null = null
  private pendingViewport: {
    input: RouteViewportQuery
    viewportVersion: number
  } | null = null
  private animationFrame: number | null = null
  private view: Pick<
    RouteViewportQuery,
    "viewLevel" | "visibleEventIds" | "selectedTransitEventId"
  > = {
    viewLevel: "overview",
    visibleEventIds: [],
    selectedTransitEventId: null,
  }

  constructor(
    private readonly onIntentRef: React.RefObject<
      ((intent: MapIntent) => void) | undefined
    >,
    private readonly setRenderedRevisionKey: (key: string | null) => void
  ) {
    this.worker.addEventListener("message", this.handleWorkerMessage)
  }

  setMap(map: AMap.Map | null) {
    if (this.map === map) return
    if (this.map) {
      this.map.off("zoomend", this.handleViewportEnd)
      this.map.off("moveend", this.handleViewportEnd)
    }
    this.manager?.clear()
    this.map = map
    this.manager = map ? new RouteLayerManager(map, this.onIntentRef) : null
    if (map) {
      map.on("zoomend", this.handleViewportEnd)
      map.on("moveend", this.handleViewportEnd)
      this.requestQuery()
    }
  }

  setRevision(snapshot: TargetFlatJourneySnapshot | null) {
    const nextKey = snapshot
      ? `${snapshot.journeyId}:${snapshot.revision}`
      : null
    if (this.revisionKey === nextKey) return
    this.setRenderedRevisionKey(null)
    this.revisionKey = nextKey
    this.indexReady = false
    this.pendingViewport = null
    this.viewportVersion += 1
    if (!snapshot || !nextKey) {
      this.scheduleCommit({ lines: [], transfers: [] }, null)
      return
    }
    this.worker.postMessage({
      type: "route.revision.replace",
      revisionKey: nextKey,
      source: routeRevisionInput(snapshot),
    })
  }

  setView(
    view: Pick<
      RouteViewportQuery,
      "viewLevel" | "visibleEventIds" | "selectedTransitEventId"
    >
  ) {
    this.view = view
    this.requestQuery()
  }

  dispose() {
    if (this.map) {
      this.map.off("zoomend", this.handleViewportEnd)
      this.map.off("moveend", this.handleViewportEnd)
    }
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame)
    }
    this.manager?.clear()
    this.worker.postMessage({ type: "route.dispose" })
    this.worker.terminate()
  }

  private readonly handleViewportEnd = () => {
    this.requestQuery()
  }

  private readonly handleWorkerMessage = (
    event: MessageEvent<RouteWorkerResponse>
  ) => {
    const message = event.data
    if (message.type === "route.worker.failed") {
      if (message.revisionKey === this.revisionKey) {
        console.error("Route Worker failed:", message.message)
      }
      if (
        message.queryId !== undefined &&
        this.inFlight?.queryId === message.queryId &&
        this.inFlight.revisionKey === message.revisionKey
      ) {
        this.inFlight = null
      }
      return
    }

    if (message.type === "route.revision.ready") {
      if (message.revisionKey !== this.revisionKey) return
      this.indexReady = true
      this.requestQuery()
      return
    }

    if (
      !this.inFlight ||
      message.revisionKey !== this.inFlight.revisionKey ||
      message.queryId !== this.inFlight.queryId
    ) {
      return
    }
    const completed = this.inFlight
    this.inFlight = null
    if (this.pendingViewport) {
      const pending = this.pendingViewport
      this.pendingViewport = null
      this.dispatchQuery(pending)
      return
    }
    if (
      message.revisionKey !== this.revisionKey ||
      completed.viewportVersion !== this.viewportVersion
    ) {
      this.requestQuery()
      return
    }
    this.scheduleCommit(message.model, message.revisionKey)
  }

  private requestQuery() {
    if (!this.map || !this.revisionKey || !this.indexReady) return
    const bounds = this.map.getBounds()
    const southWest = bounds.getSouthWest()
    const northEast = bounds.getNorthEast()
    const snapshot = {
      input: {
        zoom: this.map.getZoom(),
        viewLevel: this.view.viewLevel,
        bounds: {
          west: southWest.getLng(),
          south: southWest.getLat(),
          east: northEast.getLng(),
          north: northEast.getLat(),
        },
        visibleEventIds: this.view.visibleEventIds,
        selectedTransitEventId: this.view.selectedTransitEventId,
      },
      viewportVersion: ++this.viewportVersion,
    }
    if (this.inFlight) {
      this.pendingViewport = snapshot
      return
    }
    this.dispatchQuery(snapshot)
  }

  private dispatchQuery(snapshot: {
    input: RouteViewportQuery
    viewportVersion: number
  }) {
    if (!this.revisionKey) return
    const queryId = ++this.querySequence
    this.inFlight = {
      revisionKey: this.revisionKey,
      queryId,
      viewportVersion: snapshot.viewportVersion,
    }
    this.worker.postMessage({
      type: "route.viewport.query",
      revisionKey: this.revisionKey,
      queryId,
      input: snapshot.input,
    })
  }

  private scheduleCommit(model: PackedRouteRenderModel, key: string | null) {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame)
    }
    const viewportVersion = this.viewportVersion
    this.animationFrame = requestAnimationFrame(() => {
      this.animationFrame = null
      if (
        key !== this.revisionKey ||
        viewportVersion !== this.viewportVersion ||
        this.inFlight ||
        this.pendingViewport
      ) {
        return
      }
      this.manager?.sync(model)
      this.setRenderedRevisionKey(key)
    })
  }
}

class RouteLayerManager {
  private readonly lines = new Map<
    string,
    {
      overlay: AMap.Polyline
      coordinates: Float64Array
      partOffsets: Uint32Array
      styleKey: string
    }
  >()
  private readonly transfers = new Map<string, AMap.Marker>()

  constructor(
    private readonly map: AMap.Map,
    private readonly onIntentRef: React.RefObject<
      ((intent: MapIntent) => void) | undefined
    >
  ) {}

  sync(model: PackedRouteRenderModel) {
    const nextLineKeys = new Set(model.lines.map((line) => line.key))
    const nextTransferKeys = new Set(
      model.transfers.map((transfer) => transfer.key)
    )
    const additions: Array<AMap.Polyline | AMap.Marker> = []

    for (const line of model.lines) {
      const retained = this.lines.get(line.key)
      const styleKey = routeStyleKey(line)
      if (!retained) {
        const overlay = new AMap.Polyline(routeOptions(line))
        overlay.setPath(
          unpackPath(line) as unknown as Parameters<AMap.Polyline["setPath"]>[0]
        )
        overlay.on("click", (mapEvent) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ;(mapEvent as any).stopPropagation?.()
          this.onIntentRef.current?.({
            type: "map.transit-selected",
            eventId: line.eventId,
          })
        })
        this.lines.set(line.key, {
          overlay,
          coordinates: line.coordinates,
          partOffsets: line.partOffsets,
          styleKey,
        })
        additions.push(overlay)
        continue
      }
      if (
        !sameNumbers(retained.coordinates, line.coordinates) ||
        !sameNumbers(retained.partOffsets, line.partOffsets)
      ) {
        retained.overlay.setPath(
          unpackPath(line) as unknown as Parameters<AMap.Polyline["setPath"]>[0]
        )
        retained.coordinates = line.coordinates
        retained.partOffsets = line.partOffsets
      }
      if (retained.styleKey !== styleKey) {
        retained.overlay.setOptions(routeOptions(line))
        retained.styleKey = styleKey
      }
    }

    for (const transfer of model.transfers) {
      const retained = this.transfers.get(transfer.key)
      const position = new AMap.LngLat(transfer.lng, transfer.lat)
      if (retained) {
        retained.setPosition(position)
        continue
      }
      const marker = new AMap.Marker({
        position,
        content:
          '<span aria-hidden="true" style="display:block;width:10px;height:10px;border:3px solid #fff;background:#2c2416;border-radius:50%"></span>',
        offset: new AMap.Pixel(-5, -5),
      })
      this.transfers.set(transfer.key, marker)
      additions.push(marker)
    }

    if (additions.length) this.map.add(additions)

    const removals: Array<AMap.Polyline | AMap.Marker> = []
    for (const [key, retained] of this.lines) {
      if (nextLineKeys.has(key)) continue
      removals.push(retained.overlay)
      this.lines.delete(key)
    }
    for (const [key, retained] of this.transfers) {
      if (nextTransferKeys.has(key)) continue
      removals.push(retained)
      this.transfers.delete(key)
    }
    if (removals.length) this.map.remove(removals)
  }

  clear() {
    const overlays = [
      ...[...this.lines.values()].map((entry) => entry.overlay),
      ...this.transfers.values(),
    ]
    if (overlays.length) this.map.remove(overlays)
    this.lines.clear()
    this.transfers.clear()
  }
}

function routeRevisionInput(snapshot: TargetFlatJourneySnapshot): {
  transits: RouteRevisionTransit[]
} {
  const locations = new Map(
    snapshot.events
      .filter((event): event is FlatLocationEvent => event.kind !== "TRANSIT")
      .map((event) => [event.eventId, event.detail.place])
  )
  return {
    transits: snapshot.events.flatMap((event) => {
      if (event.kind !== "TRANSIT") return []
      const from = locations.get(event.detail.fromEventKey)
      const to = locations.get(event.detail.toEventKey)
      return [
        {
          eventId: event.eventId,
          transportMode: event.detail.transportMode,
          routeState: event.detail.routeState,
          route: event.detail.route,
          ...(from ? { from: { lng: from.lng, lat: from.lat } } : {}),
          ...(to ? { to: { lng: to.lng, lat: to.lat } } : {}),
        },
      ]
    }),
  }
}

function unpackPath(line: PackedRouteLine) {
  const parts: Array<Array<[number, number]>> = []
  let pointStart = 0
  for (const pointEnd of line.partOffsets) {
    const part: Array<[number, number]> = []
    for (let pointIndex = pointStart; pointIndex < pointEnd; pointIndex += 1) {
      part.push([
        line.coordinates[pointIndex * 2]!,
        line.coordinates[pointIndex * 2 + 1]!,
      ])
    }
    if (part.length >= 2) parts.push(part)
    pointStart = pointEnd
  }
  return parts
}

function routeOptions(
  line: PackedRouteLine
): Parameters<AMap.Polyline["setOptions"]>[0] {
  if (line.kind === "traffic" && line.status) {
    return {
      strokeColor: trafficSectionColors[line.status],
      strokeWeight: line.selected ? 9 : 7,
      strokeOpacity: 0.98,
      zIndex: 125,
    }
  }
  const dashed = line.style !== "solid"
  return {
    strokeColor: periplusColors.routeBlue,
    strokeWeight: line.selected ? 9 : 7,
    strokeOpacity: line.routeStale ? 0.48 : line.dimmed ? 0.3 : 0.96,
    strokeStyle: dashed ? "dashed" : "solid",
    strokeDasharray:
      line.style === "dashed-short-direction"
        ? [4, 8]
        : dashed
          ? [10, 8]
          : undefined,
    showDir: line.style === "solid" || line.style.endsWith("direction"),
    lineJoin: "round",
    lineCap: "round",
    zIndex: line.selected ? 120 : 95,
  }
}

function routeStyleKey(line: PackedRouteLine) {
  return [
    line.kind,
    line.status ?? "",
    line.style,
    line.routeStale,
    line.selected,
    line.dimmed,
  ].join(":")
}

function sameNumbers(
  left: Float64Array | Uint32Array,
  right: Float64Array | Uint32Array
) {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}
