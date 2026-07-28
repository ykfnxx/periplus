"use client"

import { useEffect } from "react"
import { getActivePathView } from "@/lib/routes/active-path"
import { getEdgePathPositions } from "@/lib/routes/edge-geometry"
import { selectedRoutePlan } from "@/lib/routes/planning"
import {
  getRouteSegmentStyle,
  getTransportEdgeStyle,
  trafficSectionColors,
} from "@/lib/ui/map-theme"
import { useWorkspaceViewportInsets } from "@/modules/workspace/state/selectors"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { toAMapAvoid } from "@/modules/workspace/viewport"
import type { MapIntent } from "@/modules/workspace/contracts"
import type { PathEdge, RouteLngLat, RoutePlan } from "@/types/route"

function lngLatPath(positions: RouteLngLat[]) {
  return positions.map(([lng, lat]) => new AMap.LngLat(lng, lat))
}

interface RoutePolylineProps {
  onIntent?: (intent: MapIntent) => void
}

export default function RoutePolyline({ onIntent }: RoutePolylineProps) {
  const map = useWorkspaceStore((state) => state.map)
  const draftRoute = useWorkspaceStore((state) => state.draftRoute)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeRouteNodeId = useWorkspaceStore(
    (state) => state.activeRouteNodeId
  )
  const selectedEdgeId = useWorkspaceStore((state) => state.selectedEdgeId)
  const viewportInsets = useWorkspaceViewportInsets()

  useEffect(() => {
    if (!map || !draftRoute) return
    const view = getActivePathView(draftRoute, viewLevel, activeRouteNodeId)
    const nodeById = new Map(view.nodes.map((node) => [node.id, node]))
    const polylines: AMap.Polyline[] = []
    const transferMarkers: AMap.Marker[] = []
    let ensureCityZoomTimer: ReturnType<typeof setTimeout> | null = null

    const bindSelection = (polyline: AMap.Polyline, edge: PathEdge) => {
      polyline.on("click", (event) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(event as any).stopPropagation?.()
        onIntent?.({ type: "map.edge-selected", edgeId: edge.id })
      })
    }

    for (const edge of view.edges) {
      const from = nodeById.get(edge.fromNodeId)
      const to = nodeById.get(edge.toNodeId)
      if (!from || !to) continue
      const selected = selectedRoutePlan(edge)
      const isSelected = selectedEdgeId === edge.id

      if (selected) {
        for (const candidate of edge.plans ?? []) {
          if (candidate.id === selected.id) continue
          drawCandidate(candidate, polylines)
        }
        drawSelectedPlan(
          selected,
          edge,
          isSelected,
          polylines,
          transferMarkers,
          bindSelection
        )
        continue
      }

      const positions = getEdgePathPositions(from, to, edge.transportMode)
      const style = getTransportEdgeStyle(edge.transportMode)
      const fallback = new AMap.Polyline({
        path: lngLatPath(positions),
        strokeColor: style.color,
        strokeWeight: isSelected ? 7 : 5,
        strokeOpacity: edge.planningStatus === "FAILED" ? 0.35 : 0.55,
        strokeStyle: "dashed",
        strokeDasharray: style.dasharray ?? [8, 8],
        lineJoin: "round",
        lineCap: "round",
        zIndex: isSelected ? 120 : 70,
      })
      bindSelection(fallback, edge)
      polylines.push(fallback)
    }

    const overlays = [...polylines, ...transferMarkers]
    if (overlays.length) map.add(overlays)
    if (polylines.length) {
      map.setFitView(
        polylines,
        false,
        toAMapAvoid(viewportInsets),
        view.level === "city" ? 15 : 12
      )
      if (view.level === "city") {
        ensureCityZoomTimer = setTimeout(() => {
          if (
            useWorkspaceStore.getState().viewLevel === "city" &&
            map.getZoom() < 12
          ) {
            map.setZoom(12)
          }
        }, 250)
      }
    } else if (view.nodes.length === 1) {
      const node = view.nodes[0]
      map.setZoomAndCenter(
        view.level === "city" ? 13 : 8,
        new AMap.LngLat(node.lng, node.lat)
      )
    }

    return () => {
      if (ensureCityZoomTimer) clearTimeout(ensureCityZoomTimer)
      if (overlays.length) map.remove(overlays)
    }
  }, [
    map,
    draftRoute,
    viewLevel,
    activeRouteNodeId,
    selectedEdgeId,
    onIntent,
    viewportInsets,
  ])

  return null
}

function drawCandidate(plan: RoutePlan, polylines: AMap.Polyline[]) {
  for (const segment of plan.segments) {
    if (segment.positions.length < 2) continue
    polylines.push(
      new AMap.Polyline({
        path: lngLatPath(segment.positions),
        strokeColor: "#8fa1a8",
        strokeWeight: 4,
        strokeOpacity: 0.42,
        strokeStyle: segment.geometryKind === "SCHEMATIC" ? "dashed" : "solid",
        strokeDasharray:
          segment.geometryKind === "SCHEMATIC" ? [10, 8] : undefined,
        lineJoin: "round",
        lineCap: "round",
        zIndex: 55,
      })
    )
  }
}

function drawSelectedPlan(
  plan: RoutePlan,
  edge: PathEdge,
  isSelected: boolean,
  polylines: AMap.Polyline[],
  transferMarkers: AMap.Marker[],
  bindSelection: (polyline: AMap.Polyline, edge: PathEdge) => void
) {
  plan.segments.forEach((segment, index) => {
    if (segment.positions.length < 2) return
    const schematic = segment.geometryKind === "SCHEMATIC"
    const path = lngLatPath(segment.positions)
    const casing = new AMap.Polyline({
      path,
      strokeColor: "#fffaf3",
      strokeWeight: isSelected ? 14 : 12,
      strokeOpacity: edge.planningStatus === "STALE" ? 0.58 : 0.96,
      strokeStyle: schematic ? "dashed" : "solid",
      strokeDasharray: schematic ? [12, 8] : undefined,
      lineJoin: "round",
      lineCap: "round",
      zIndex: isSelected ? 115 : 90,
    })
    const style = getRouteSegmentStyle(segment.mode)
    const main = new AMap.Polyline({
      path,
      strokeColor: style.color,
      strokeWeight: isSelected ? 9 : 7,
      strokeOpacity: edge.planningStatus === "STALE" ? 0.48 : 0.96,
      strokeStyle:
        schematic || style.strokeStyle === "dashed" ? "dashed" : "solid",
      strokeDasharray: schematic ? [10, 8] : style.dasharray,
      lineJoin: "round",
      lineCap: "round",
      showDir: !schematic,
      zIndex: isSelected ? 120 : 95,
    })
    bindSelection(casing, edge)
    bindSelection(main, edge)
    polylines.push(casing, main)

    for (const traffic of segment.trafficSections ?? []) {
      if (traffic.positions.length < 2) continue
      const trafficLine = new AMap.Polyline({
        path: lngLatPath(traffic.positions),
        strokeColor: trafficSectionColors[traffic.status],
        strokeWeight: isSelected ? 9 : 7,
        strokeOpacity: 0.98,
        lineJoin: "round",
        lineCap: "round",
        zIndex: isSelected ? 122 : 97,
      })
      bindSelection(trafficLine, edge)
      polylines.push(trafficLine)
    }

    if (index > 0) {
      const [lng, lat] = segment.positions[0]
      transferMarkers.push(
        new AMap.Marker({
          position: new AMap.LngLat(lng, lat),
          content:
            '<span aria-hidden="true" style="display:block;width:10px;height:10px;border:3px solid #fff;background:#2c2416;border-radius:50%;box-shadow:0 1px 4px rgb(0 0 0 / 25%)"></span>',
          offset: new AMap.Pixel(-5, -5),
          zIndex: 125,
        })
      )
    }
  })
}
