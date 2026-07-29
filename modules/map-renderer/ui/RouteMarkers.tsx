"use client"

import { useEffect, useState } from "react"
import { getActivePathView } from "@/lib/routes/active-path"
import {
  calculateAnchorClusters,
  collectClusteredSourceIds,
  createAnchorItems,
} from "@/lib/map/anchor-clusters"
import type { MapIntent } from "@/modules/workspace/contracts"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { periplusColors, routeMarkerColors } from "@/lib/ui/map-theme"

interface RouteMarkersProps {
  onIntent?: (intent: MapIntent) => void
}

export default function RouteMarkers({ onIntent }: RouteMarkersProps) {
  const [viewportRevision, setViewportRevision] = useState(0)
  const map = useWorkspaceStore((s) => s.map)
  const draftRoute = useWorkspaceStore((s) => s.draftRoute)
  const viewLevel = useWorkspaceStore((s) => s.viewLevel)
  const activeRouteNodeId = useWorkspaceStore((s) => s.activeRouteNodeId)
  const photoShares = useWorkspaceStore((s) => s.photoShares)
  const hoveredRouteNodeId = useWorkspaceStore((s) => s.hoveredRouteNodeId)
  const selectedLocationPoint = useWorkspaceStore(
    (s) => s.selectedLocationPoint
  )

  useEffect(() => {
    if (!map) return

    let frame: number | null = null
    const refreshMarkers = () => {
      if (frame !== null) return

      frame = window.requestAnimationFrame(() => {
        frame = null
        setViewportRevision((revision) => revision + 1)
      })
    }

    map.on("zoomchange", refreshMarkers)

    return () => {
      map.off("zoomchange", refreshMarkers)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [map])

  useEffect(() => {
    if (!map || !draftRoute) return

    const view = getActivePathView(draftRoute, viewLevel, activeRouteNodeId)
    if (view.nodes.length === 0) return

    const markers: AMap.Marker[] = []
    const longPressTimers: Array<ReturnType<typeof setTimeout>> = []

    const sortedPoints = [...view.nodes].sort((a, b) => a.order - b.order)

    const clusters = calculateAnchorClusters(
      createAnchorItems(sortedPoints, photoShares),
      (anchor) => {
        const pixel = map.lngLatToContainer(
          new AMap.LngLat(anchor.lng, anchor.lat)
        )
        return { x: pixel.getX(), y: pixel.getY() }
      }
    )
    const clusteredIds = collectClusteredSourceIds(clusters, "route")

    sortedPoints.forEach((point, index) => {
      // 重叠点始终交给 OverlapCluster 渲染，避免散开时普通 marker 抢回原位。
      if (clusteredIds.has(point.id)) return

      const content = document.createElement("div")
      content.className = [
        "periplus-map-marker",
        "periplus-map-marker--bright",
        hoveredRouteNodeId === point.id ? "periplus-map-marker--hovered" : "",
        selectedLocationPoint?.id === point.id
          ? "periplus-map-marker--selected"
          : "",
      ]
        .filter(Boolean)
        .join(" ")
      content.setAttribute("role", "button")
      content.setAttribute("aria-label", `选择地点 ${point.name}`)
      const colorIndex = index % routeMarkerColors.length
      content.style.background =
        view.level === "overview"
          ? routeMarkerColors[colorIndex]
          : periplusColors.routeBlue
      content.style.color =
        view.level === "overview" && colorIndex === 2
          ? periplusColors.ink
          : periplusColors.white
      content.textContent = `${index + 1}`

      const marker = new AMap.Marker({
        content,
        position: new AMap.LngLat(point.lng, point.lat),
        title: point.name,
        offset: new AMap.Pixel(-18, -18),
      })

      marker.on("click", (event) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(event as any).stopPropagation?.()
        onIntent?.({
          type: "map.waypoint-selected",
          waypointId: point.id,
        })
      })
      marker.on("mouseover", () => {
        onIntent?.({
          type: "map.waypoint-hovered",
          waypointId: point.id,
        })
      })
      marker.on("mouseout", () => {
        onIntent?.({
          type: "map.waypoint-hover-cleared",
          waypointId: point.id,
        })
      })
      marker.on("touchstart", () => {
        const timer = setTimeout(() => {
          onIntent?.({
            type: "map.waypoint-selected",
            waypointId: point.id,
          })
        }, 500)
        longPressTimers.push(timer)
      })
      marker.on("touchmove", () => {
        longPressTimers.splice(0).forEach(clearTimeout)
      })
      marker.on("touchend", () => {
        longPressTimers.splice(0).forEach(clearTimeout)
      })

      markers.push(marker)
    })

    map.add(markers)

    return () => {
      longPressTimers.splice(0).forEach(clearTimeout)
      map.remove(markers)
    }
  }, [
    map,
    draftRoute,
    viewLevel,
    activeRouteNodeId,
    viewportRevision,
    photoShares,
    hoveredRouteNodeId,
    selectedLocationPoint,
    onIntent,
  ])

  return null
}
