"use client"

import { useEffect } from "react"
import type { MapIntent } from "@/modules/workspace/contracts"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function PhotoMarkers({
  onIntent,
}: {
  onIntent?: (intent: MapIntent) => void
}) {
  const map = useWorkspaceStore((state) => state.map)
  const photoShares = useWorkspaceStore((state) => state.photoShares)

  useEffect(() => {
    if (!map || photoShares.length === 0) return
    const markers = photoShares.map((photo) => {
      const content = document.createElement("div")
      content.className = "periplus-photo-marker"
      const image = document.createElement("img")
      image.src = photo.imageDataUrl
      image.alt = ""
      image.style.cssText = "width:100%;height:100%;object-fit:cover;"
      content.append(image)
      const marker = new AMap.Marker({
        position: new AMap.LngLat(photo.lng, photo.lat),
        content,
        offset: new AMap.Pixel(-24, -24),
      })
      marker.on("click", (mapEvent) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(mapEvent as any).stopPropagation?.()
        onIntent?.({ type: "map.photo-selected", photoId: photo.id })
      })
      return marker
    })
    map.add(markers)
    return () => map.remove(markers)
  }, [map, photoShares, onIntent])

  return null
}
