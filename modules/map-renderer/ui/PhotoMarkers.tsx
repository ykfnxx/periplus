"use client"

import { useEffect } from "react"
import {
  calculateAnchorClusters,
  collectClusteredSourceIds,
  createAnchorItems,
} from "@/lib/map/anchor-clusters"
import { getActivePathView } from "@/lib/routes/active-path"
import type { MapIntent } from "@/modules/workspace/contracts"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

interface PhotoMarkersProps {
  onIntent?: (intent: MapIntent) => void
}

export default function PhotoMarkers({ onIntent }: PhotoMarkersProps) {
  const map = useWorkspaceStore((s) => s.map)
  const draftRoute = useWorkspaceStore((s) => s.draftRoute)
  const viewLevel = useWorkspaceStore((s) => s.viewLevel)
  const activeRouteNodeId = useWorkspaceStore((s) => s.activeRouteNodeId)
  const photoShares = useWorkspaceStore((s) => s.photoShares)

  useEffect(() => {
    if (!map || photoShares.length === 0) return

    const markers: AMap.Marker[] = []

    const view = getActivePathView(draftRoute, viewLevel, activeRouteNodeId)
    const routeNodes = view.nodes.map((node) => ({
      id: node.id,
      lat: node.lat,
      lng: node.lng,
      order: node.order,
      name: node.name,
    }))
    const clusters = calculateAnchorClusters(
      createAnchorItems(routeNodes, photoShares),
      (anchor) => {
        const pixel = map.lngLatToContainer(
          new AMap.LngLat(anchor.lng, anchor.lat)
        )
        return { x: pixel.getX(), y: pixel.getY() }
      }
    )
    const clusteredIds = collectClusteredSourceIds(clusters, "photo")

    photoShares.forEach((photo) => {
      // 重叠照片由 OverlapCluster 渲染，普通照片层只画独立照片点。
      if (clusteredIds.has(photo.id)) return

      const content = document.createElement("div")
      content.className = "periplus-photo-marker"
      content.innerHTML = `<img src="${photo.imageDataUrl}" alt="" style="width:100%;height:100%;object-fit:cover;" />`

      const marker = new AMap.Marker({
        position: new AMap.LngLat(photo.lng, photo.lat),
        content,
        offset: new AMap.Pixel(-24, -24),
      })

      marker.on("click", (event) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(event as any).stopPropagation?.()
        onIntent?.({ type: "map.photo-selected", photoId: photo.id })
      })

      markers.push(marker)
    })

    map.add(markers)

    return () => {
      map.remove(markers)
    }
  }, [map, draftRoute, viewLevel, activeRouteNodeId, photoShares, onIntent])

  return null
}
