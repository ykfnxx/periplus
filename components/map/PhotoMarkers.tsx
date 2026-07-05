"use client"

import { useEffect } from "react"
import {
  calculateAnchorClusters,
  collectClusteredSourceIds,
  createAnchorItems,
} from "@/lib/map/anchor-clusters"
import { useMapStore } from "@/stores/mapStore"

export default function PhotoMarkers() {
  const map = useMapStore((s) => s.map)
  const currentRoute = useMapStore((s) => s.currentRoute)
  const photoShares = useMapStore((s) => s.photoShares)
  const selectedPhotoShare = useMapStore((s) => s.selectedPhotoShare)
  const setSelectedLocationPoint = useMapStore(
    (s) => s.setSelectedLocationPoint
  )
  const setSelectedPhotoShare = useMapStore((s) => s.setSelectedPhotoShare)

  useEffect(() => {
    if (!map || photoShares.length === 0) return

    const markers: AMap.Marker[] = []

    const routeNodes =
      currentRoute?.nodes.map((node) => ({
        id: node.id,
        lat: node.lat,
        lng: node.lng,
        order: node.order,
        name: node.name,
      })) ?? []
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
        if (selectedPhotoShare?.id === photo.id) {
          setSelectedPhotoShare(null)
          return
        }
        setSelectedLocationPoint(null)
        setSelectedPhotoShare(photo)
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
    selectedPhotoShare?.id,
    setSelectedLocationPoint,
    setSelectedPhotoShare,
  ])

  return null
}
