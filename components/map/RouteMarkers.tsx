"use client"

import { useEffect } from "react"
import { getActivePathView } from "@/lib/routes/active-path"
import {
  calculateAnchorClusters,
  collectClusteredSourceIds,
  createAnchorItems,
} from "@/lib/map/anchor-clusters"
import { useMapStore } from "@/stores/mapStore"
import { periplusColors } from "@/lib/ui/map-theme"

export default function RouteMarkers() {
  const map = useMapStore((s) => s.map)
  const currentRoute = useMapStore((s) => s.currentRoute)
  const viewLevel = useMapStore((s) => s.viewLevel)
  const activeRouteNodeId = useMapStore((s) => s.activeRouteNodeId)
  const photoShares = useMapStore((s) => s.photoShares)
  const selectedLocationPoint = useMapStore((s) => s.selectedLocationPoint)
  const setSelectedLocationPoint = useMapStore(
    (s) => s.setSelectedLocationPoint
  )
  const setSelectedPhotoShare = useMapStore((s) => s.setSelectedPhotoShare)
  const enterCityView = useMapStore((s) => s.enterCityView)

  useEffect(() => {
    if (!map || !currentRoute) return

    const view = getActivePathView(currentRoute, viewLevel, activeRouteNodeId)
    if (view.nodes.length === 0) return

    const markers: AMap.Marker[] = []
    const longPressTimers: Array<ReturnType<typeof setTimeout>> = []

    const sortedPoints = [...view.nodes].sort(
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
      content.className = "periplus-map-marker periplus-map-marker--bluegray"
      content.style.background = periplusColors.bluegray
      content.style.color = "var(--periplus-white)"
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
        if (view.level === "overview") {
          enterCityView(point.id)
          return
        }
        if (selectedLocationPoint?.id === point.id) {
          setSelectedLocationPoint(null)
          return
        }
        setSelectedPhotoShare(null)
        setSelectedLocationPoint(point)
      })
      marker.on("mouseover", () => {
        setSelectedPhotoShare(null)
        setSelectedLocationPoint(point)
      })
      marker.on("mouseout", () => {
        setSelectedLocationPoint(null)
      })
      marker.on("touchstart", () => {
        const timer = setTimeout(() => {
          setSelectedPhotoShare(null)
          setSelectedLocationPoint(point)
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
    currentRoute,
    viewLevel,
    activeRouteNodeId,
    photoShares,
    selectedLocationPoint?.id,
    enterCityView,
    setSelectedLocationPoint,
    setSelectedPhotoShare,
  ])

  return null
}
