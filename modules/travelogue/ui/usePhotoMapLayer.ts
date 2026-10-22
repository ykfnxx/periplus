"use client"
import { useEffect, useMemo, useRef, useState } from "react"
import Supercluster from "supercluster"
import { loadAMap } from "@/lib/amap"
import type { PhotoItem } from "./photo-items"
import type { RecordMapInsets } from "./RecordMap"

export type MapPhoto = PhotoItem & { coordinate: { lat: number; lng: number } }
function paperButton(
  photos: MapPhoto[],
  selected: string | null | undefined,
  expanded: boolean
) {
  const button = document.createElement("button")
  button.type = "button"
  button.className = `journal-map-photo${expanded ? "" : " journal-map-photo--compact"}`
  button.dataset.photoCount = String(photos.length)
  button.setAttribute(
    "aria-label",
    photos.length > 1
      ? `地图照片：${photos.length} 张照片`
      : `地图照片：${photos[0].caption || photos[0].eventTitle}`
  )
  button.setAttribute(
    "aria-pressed",
    String(photos.some((photo) => photo.eventId === selected))
  )
  if (!expanded) {
    button.textContent = String(photos.length)
    return button
  }
  photos
    .slice(0, 3)
    .reverse()
    .forEach((photo, index, layers) => {
      const paper = document.createElement("span")
      paper.className = `journal-photo-print${index < layers.length - 1 ? ` journal-photo-print--back-${layers.length - index - 1}` : " journal-photo-print--front"}`
      const image = document.createElement("img")
      image.src = photo.url
      image.alt = ""
      image.draggable = false
      image.loading = "lazy"
      image.decoding = "async"
      paper.append(image)
      button.append(paper)
    })
  if (photos.length > 1) {
    const count = document.createElement("span")
    count.className = "journal-photo-count"
    count.textContent = String(photos.length)
    button.append(count)
  }
  return button
}

export default function usePhotoMapLayer(
  map: AMap.Map | null,
  photos: MapPhoto[],
  insets: RecordMapInsets,
  selectedEventId?: string | null,
  onOpen?: (ids: string[]) => void,
  interactive = true
) {
  const [photoMode, setPhotoMode] = useState(false)
  // Keep source membership in one index. AMap's cluster render callback omits
  // close points at lower zoom levels, even when its count includes them.
  const index = useMemo(
    () =>
      new Supercluster<{ photo: MapPhoto; order: number }>({
        radius: 96,
        extent: 256,
        maxZoom: 22,
      }).load(
        photos.map((photo, order) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: [photo.coordinate.lng, photo.coordinate.lat],
          },
          properties: { photo, order },
        }))
      ),
    [photos]
  )
  const latest = useRef({
    photos,
    selectedEventId,
    onOpen,
    insets,
    interactive,
  })
  useEffect(() => {
    latest.current = { photos, selectedEventId, onOpen, insets, interactive }
  }, [photos, selectedEventId, onOpen, insets, interactive])
  useEffect(() => {
    if (!map) return
    function update() {
      const { photos, insets } = latest.current
      if (!photos.length) {
        setPhotoMode(false)
        return
      }
      const pixels = photos.map((photo) =>
        map!.lngLatToContainer([photo.coordinate.lng, photo.coordinate.lat])
      )
      const xs = pixels.map((pixel) => pixel.getX())
      const ys = pixels.map((pixel) => pixel.getY())
      const span = Math.hypot(
        Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys)
      )
      const size = map!.getSize()
      const available = Math.max(
        120,
        Math.min(
          size.getWidth() - insets.left - insets.right,
          size.getHeight() - insets.top - insets.bottom
        )
      )
      // Screen coverage rather than a fixed map zoom drives the switch. A
      // single-place journey needs a local zoom; hysteresis avoids flickering.
      setPhotoMode((current) =>
        span < 1
          ? map!.getZoom() >= (current ? 13.5 : 14)
          : span / available >= (current ? 0.25 : 0.35)
      )
    }
    update()
    for (const event of ["complete", "zoomend", "moveend", "resize"])
      map.on(event, update)
    return () => {
      for (const event of ["complete", "zoomend", "moveend", "resize"])
        map.off(event, update)
    }
  }, [map, photos, insets])
  useEffect(() => {
    if (!map || !photos.length) return
    let disposed = false
    let markers: AMap.Marker[] = []
    let render: (() => void) | undefined
    void loadAMap().then((sdk) => {
      if (disposed) return
      render = () => {
        const next = index
          .getClusters([-180, -85, 180, 85], Math.floor(map.getZoom()))
          .map((feature) => {
            const members =
              "cluster_id" in feature.properties
                ? index
                    .getLeaves(feature.properties.cluster_id, Infinity)
                    .sort((a, b) => a.properties.order - b.properties.order)
                    .map((point) => point.properties.photo)
                : [feature.properties.photo]
            const marker = new sdk.Marker({
              position: feature.geometry.coordinates as [number, number],
            })
            const button = paperButton(
              members,
              latest.current.selectedEventId,
              photoMode
            )
            button.tabIndex = interactive ? 0 : -1
            button.onclick = (event) => {
              event.stopPropagation()
              if (!latest.current.interactive) return
              const first = members[0].coordinate
              const samePlace = members.every(
                (photo) =>
                  Math.abs(photo.coordinate.lng - first.lng) < 0.000001 &&
                  Math.abs(photo.coordinate.lat - first.lat) < 0.000001
              )
              if (members.length > 1 && !samePlace && map.getZoom() < 19) {
                const { left, right, top, bottom } = latest.current.insets
                map.setFitView(
                  members.map(
                    (photo) =>
                      new sdk.Marker({
                        position: [photo.coordinate.lng, photo.coordinate.lat],
                      })
                  ),
                  false,
                  [top + 130, bottom + 24, left + 72, right + 72],
                  19
                )
              } else latest.current.onOpen?.(members.map((photo) => photo.id))
            }
            marker.setContent(button)
            marker.setAnchor("bottom-center")
            marker.setOffset(new sdk.Pixel(0, 0))
            marker.setzIndex(
              members.some(
                (photo) => photo.eventId === latest.current.selectedEventId
              )
                ? 120
                : 100
            )
            return marker
          })
        map.add(next)
        map.remove(markers)
        markers = next
      }
      render()
      map.on("zoomend", render)
    })
    return () => {
      disposed = true
      if (render) map.off("zoomend", render)
      map.remove(markers)
    }
  }, [map, photoMode, index, photos, selectedEventId, interactive])
  return photoMode
}
