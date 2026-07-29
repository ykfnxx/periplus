"use client"

import { useEffect, useState } from "react"
import { getActivePathView } from "@/lib/routes/active-path"
import {
  formatRouteDuration,
  routeBadgeAnchor,
  routeModeLabel,
} from "@/lib/routes/route-display"
import {
  resolveRouteBadgeCollisions,
  type RouteBadgeCandidate,
} from "@/lib/routes/route-badges"
import { selectedRoutePlan } from "@/lib/routes/planning"
import type { MapIntent } from "@/modules/workspace/contracts"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

interface EdgeBadgeLayerProps {
  onIntent?: (intent: MapIntent) => void
}

interface BadgeDescriptor extends RouteBadgeCandidate {
  label: string
  isStale: boolean
}

export default function EdgeBadgeLayer({ onIntent }: EdgeBadgeLayerProps) {
  const [viewportRevision, setViewportRevision] = useState(0)
  const map = useWorkspaceStore((state) => state.map)
  const draftRoute = useWorkspaceStore((state) => state.draftRoute)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeRouteNodeId = useWorkspaceStore(
    (state) => state.activeRouteNodeId
  )
  const selectedEdgeId = useWorkspaceStore((state) => state.selectedEdgeId)

  useEffect(() => {
    if (!map) return

    let frame: number | null = null
    const refresh = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(() => {
        frame = null
        setViewportRevision((revision) => revision + 1)
      })
    }

    map.on("zoomend", refresh)
    map.on("moveend", refresh)
    return () => {
      map.off("zoomend", refresh)
      map.off("moveend", refresh)
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [map])

  useEffect(() => {
    if (!map || !draftRoute) return

    const view = getActivePathView(draftRoute, viewLevel, activeRouteNodeId)
    const descriptors = view.edges.flatMap<BadgeDescriptor>((edge) => {
      const plan = selectedRoutePlan(edge)
      if (!plan || edge.planningStatus === "FAILED") return []
      const anchor = routeBadgeAnchor(plan)
      if (!anchor) return []

      // 总览只保留较长的关键交通段，城市详情才展示短距离标签。
      const minimumDistance = view.level === "overview" ? 15_000 : 180
      if (plan.distanceMeters < minimumDistance) return []

      return [
        {
          edgeId: edge.id,
          position: anchor.position,
          isSelected: selectedEdgeId === edge.id,
          priority: plan.distanceMeters,
          label: `${routeModeLabel(anchor.segment.mode)} ${formatRouteDuration(
            plan.durationSeconds
          )}`,
          isStale: edge.planningStatus === "STALE",
        },
      ]
    })

    const descriptorByEdgeId = new Map(
      descriptors.map((descriptor) => [descriptor.edgeId, descriptor])
    )
    const placements = resolveRouteBadgeCollisions(descriptors, (position) => {
      const pixel = map.lngLatToContainer(
        new AMap.LngLat(position[0], position[1])
      )
      return { x: pixel.getX(), y: pixel.getY() }
    })
    const markers: AMap.Marker[] = []
    const cleanups: Array<() => void> = []

    for (const placement of placements) {
      const descriptor = descriptorByEdgeId.get(placement.edgeId)
      if (!descriptor) continue

      const content = document.createElement("button")
      content.type = "button"
      content.className = [
        "periplus-route-badge",
        descriptor.isSelected ? "periplus-route-badge--selected" : "",
        descriptor.isStale ? "periplus-route-badge--stale" : "",
      ]
        .filter(Boolean)
        .join(" ")
      content.setAttribute("aria-label", `选择路线段 ${descriptor.label}`)
      const dot = document.createElement("span")
      dot.className = "periplus-route-badge__dot"
      dot.setAttribute("aria-hidden", "true")
      const label = document.createElement("span")
      label.textContent = descriptor.label
      content.append(dot, label)

      const selectEdge = (event: Event) => {
        event.stopPropagation()
        onIntent?.({
          type: "map.edge-selected",
          edgeId: descriptor.edgeId,
        })
      }
      content.addEventListener("click", selectEdge)
      cleanups.push(() => content.removeEventListener("click", selectEdge))

      markers.push(
        new AMap.Marker({
          content,
          position: new AMap.LngLat(
            descriptor.position[0],
            descriptor.position[1]
          ),
          offset: new AMap.Pixel(-62, -17),
          zIndex: descriptor.isSelected ? 140 : 110,
        })
      )
    }

    if (markers.length) map.add(markers)
    return () => {
      cleanups.forEach((cleanup) => cleanup())
      if (markers.length) map.remove(markers)
    }
  }, [
    activeRouteNodeId,
    draftRoute,
    map,
    onIntent,
    selectedEdgeId,
    viewLevel,
    viewportRevision,
  ])

  return null
}
