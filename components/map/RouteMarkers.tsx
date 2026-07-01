"use client"

import { useEffect } from "react"
import { useMapStore } from "@/stores/mapStore"
import { periplusColors, routeMarkerColors } from "@/lib/ui/map-theme"

export default function RouteMarkers() {
  const map = useMapStore((s) => s.map)
  const currentRoute = useMapStore((s) => s.currentRoute)
  const setSelectedLocationPoint = useMapStore(
    (s) => s.setSelectedLocationPoint
  )

  useEffect(() => {
    if (!map || !currentRoute || currentRoute.points.length === 0) return

    const markers: AMap.Marker[] = []

    const sortedPoints = [...currentRoute.points].sort(
      (a, b) => a.order - b.order
    )

    sortedPoints.forEach((point, index) => {
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

      marker.on("click", () => {
        setSelectedLocationPoint(point)
      })

      markers.push(marker)
    })

    map.add(markers)

    return () => {
      map.remove(markers)
    }
  }, [map, currentRoute, setSelectedLocationPoint])

  return null
}
