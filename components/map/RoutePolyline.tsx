"use client"

import { useEffect } from "react"
import { getActivePathView } from "@/lib/routes/active-path"
import { useMapStore } from "@/stores/mapStore"
import { periplusColors } from "@/lib/ui/map-theme"

export default function RoutePolyline() {
  const map = useMapStore((s) => s.map)
  const currentRoute = useMapStore((s) => s.currentRoute)
  const viewLevel = useMapStore((s) => s.viewLevel)
  const activeRouteNodeId = useMapStore((s) => s.activeRouteNodeId)
  const selectedEdgeId = useMapStore((s) => s.selectedEdgeId)
  const setSelectedEdgeId = useMapStore((s) => s.setSelectedEdgeId)

  useEffect(() => {
    if (!map || !currentRoute) return

    const view = getActivePathView(currentRoute, viewLevel, activeRouteNodeId)
    const nodeById = new Map(view.nodes.map((node) => [node.id, node]))
    const polylines: AMap.Polyline[] = []
    let ensureCityZoomTimer: ReturnType<typeof setTimeout> | null = null

    for (const edge of view.edges) {
      const fromNode = nodeById.get(edge.fromNodeId)
      const toNode = nodeById.get(edge.toNodeId)
      if (!fromNode || !toNode) continue

      const polyline = new AMap.Polyline({
        path: [
          new AMap.LngLat(fromNode.lng, fromNode.lat),
          new AMap.LngLat(toNode.lng, toNode.lat),
        ],
        strokeColor:
          edge.status === "INCOMPLETE"
            ? "#a8c4d0"
            : periplusColors.bluegray,
        strokeWeight: selectedEdgeId === edge.id ? 7 : 5,
        strokeOpacity: selectedEdgeId === edge.id ? 1 : 0.88,
        strokeStyle: edge.status === "INCOMPLETE" ? "dashed" : "solid",
        strokeDasharray: edge.status === "INCOMPLETE" ? [8, 8] : undefined,
        lineJoin: "round",
        lineCap: "round",
        showDir: true,
        zIndex: selectedEdgeId === edge.id ? 130 : 80,
      })

      polyline.on("click", (event) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(event as any).stopPropagation?.()
        setSelectedEdgeId(selectedEdgeId === edge.id ? null : edge.id)
      })

      polylines.push(polyline)
    }

    if (polylines.length) {
      map.add(polylines)
      map.setFitView(
        polylines,
        false,
        [80, 80, 80, 460],
        view.level === "city" ? 15 : 12
      )
      if (view.level === "city") {
        ensureCityZoomTimer = setTimeout(() => {
          if (
            useMapStore.getState().viewLevel === "city" &&
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
      if (polylines.length) map.remove(polylines)
    }
  }, [
    map,
    currentRoute,
    viewLevel,
    activeRouteNodeId,
    selectedEdgeId,
    setSelectedEdgeId,
  ])

  return null
}
