"use client"

import { useEffect } from "react"
import {
  calculateAnchorClusters,
  collectClusteredSourceIds,
  createAnchorItems,
} from "@/lib/map/anchor-clusters"
import { useMapStore } from "@/stores/mapStore"
import { periplusColors, routeMarkerColors } from "@/lib/ui/map-theme"

export default function RouteMarkers() {
  const map = useMapStore((s) => s.map)
  const currentRoute = useMapStore((s) => s.currentRoute)
  const photoShares = useMapStore((s) => s.photoShares)
  const selectedLocationPoint = useMapStore((s) => s.selectedLocationPoint)
  const setSelectedLocationPoint = useMapStore(
    (s) => s.setSelectedLocationPoint
  )
  const setSelectedPhotoShare = useMapStore((s) => s.setSelectedPhotoShare)

  useEffect(() => {
    if (!map || !currentRoute || currentRoute.nodes.length === 0) return

    const markers: AMap.Marker[] = []

    const sortedPoints = [...currentRoute.nodes].sort(
      (a, b) => a.order - b.order
    )

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
      const markerColor = routeMarkerColors[index % routeMarkerColors.length]
      content.className = `periplus-map-marker ${
        markerColor === periplusColors.mustard ||
        markerColor === periplusColors.bluegray
          ? "periplus-map-marker--mustard"
          : ""
      }`
      content.style.background = markerColor
      content.textContent = `${index + 1}`

      const marker = new AMap.Marker({
        content,
        position: new AMap.LngLat(point.lng, point.lat),
        title: point.name,
        offset: new AMap.Pixel(-14, -14),
      })

      marker.on("click", (event) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(event as any).stopPropagation?.()
        if (selectedLocationPoint?.id === point.id) {
          setSelectedLocationPoint(null)
          return
        }
        setSelectedPhotoShare(null)
        setSelectedLocationPoint(point)
      })

      markers.push(marker)
    })

    map.add(markers)

    return () => {
      map.remove(markers)
    }
  }, [
    map,
    currentRoute,
    photoShares,
    selectedLocationPoint?.id,
    setSelectedLocationPoint,
    setSelectedPhotoShare,
  ])

  return null
}
