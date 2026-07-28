"use client"

import { useEffect } from "react"
import { getActivePathView } from "@/lib/routes/active-path"
import { getEdgePathPositions } from "@/lib/routes/edge-geometry"
import { selectedRoutePlan } from "@/lib/routes/planning"
import { useWorkspaceViewportInsets } from "@/modules/workspace/state/selectors"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { toAMapAvoid } from "@/modules/workspace/viewport"

function offsetForInsets(
  insets: ReturnType<typeof useWorkspaceViewportInsets>
) {
  return {
    x: (insets.left - insets.right) / 2,
    y: (insets.top - insets.bottom) / 2,
  }
}

export default function MapViewportController() {
  const map = useWorkspaceStore((state) => state.map)
  const draftRoute = useWorkspaceStore((state) => state.draftRoute)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeRouteNodeId = useWorkspaceStore(
    (state) => state.activeRouteNodeId
  )
  const focusRequest = useWorkspaceStore((state) => state.mapFocusRequest)
  const clearMapFocusRequest = useWorkspaceStore(
    (state) => state.clearMapFocusRequest
  )
  const viewportInsets = useWorkspaceViewportInsets()

  useEffect(() => {
    if (!map || !draftRoute || !focusRequest) return

    const view = getActivePathView(draftRoute, viewLevel, activeRouteNodeId)
    const { target } = focusRequest

    if (target.type === "node") {
      const node = view.nodes.find(
        (candidate) => candidate.id === target.nodeId
      )
      if (node) {
        map.setZoomAndCenter(target.zoom, new AMap.LngLat(node.lng, node.lat))
        const offset = offsetForInsets(viewportInsets)
        // 地图保持全屏，平移后的目标点落在未被工作台遮挡区域的视觉中心。
        map.panBy(offset.x, offset.y)
      }
      clearMapFocusRequest(focusRequest.requestId)
      return
    }

    const edge =
      target.type === "edge"
        ? view.edges.find((candidate) => candidate.id === target.edgeId)
        : null
    const overlays: Array<AMap.Polyline | AMap.Marker> = []

    if (edge) {
      const fromNode = view.nodes.find((node) => node.id === edge.fromNodeId)
      const toNode = view.nodes.find((node) => node.id === edge.toNodeId)
      if (fromNode && toNode) {
        const selected = selectedRoutePlan(edge)
        const positions =
          selected?.segments.flatMap((segment) => segment.positions) ??
          getEdgePathPositions(fromNode, toNode, edge.transportMode)
        overlays.push(
          new AMap.Polyline({
            path: positions.map(([lng, lat]) => new AMap.LngLat(lng, lat)),
            strokeOpacity: 0,
          })
        )
      }
    }

    if (target.type === "active-route") {
      overlays.push(
        ...view.nodes.map(
          (node) =>
            new AMap.Marker({
              position: new AMap.LngLat(node.lng, node.lat),
              visible: false,
            })
        )
      )
    }

    if (overlays.length > 0) {
      map.add(overlays)
      map.setFitView(
        overlays,
        false,
        toAMapAvoid(viewportInsets),
        target.maxZoom
      )
      map.remove(overlays)
    }

    clearMapFocusRequest(focusRequest.requestId)
  }, [
    activeRouteNodeId,
    clearMapFocusRequest,
    draftRoute,
    focusRequest,
    map,
    viewLevel,
    viewportInsets,
  ])

  return null
}
