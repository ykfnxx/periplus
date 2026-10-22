"use client"

import { useEffect, useRef, useState } from "react"
import { MapPin } from "lucide-react"
import { loadAMap, PERIPLUS_AMAP_STYLE } from "@/lib/amap"
import usePhotoMapLayer, { type MapPhoto } from "./usePhotoMapLayer"
import { periplusColors } from "@/lib/ui/map-theme"

export interface RecordMapPoint {
  eventId: string
  title: string
  lat: number
  lng: number
  ordinal?: number
}
export interface RecordMapInsets {
  left: number
  right: number
  top: number
  bottom: number
}
export interface RecordMapRequest {
  id: number
  type: "zoom-in" | "zoom-out" | "fit"
}
const emptyPhotos: MapPhoto[] = []
const defaultInsets: RecordMapInsets = {
  left: 40,
  right: 40,
  top: 40,
  bottom: 40,
}

export default function RecordMap({
  points,
  selectedEventId,
  onSelect,
  onPick,
  insets = defaultInsets,
  request,
  focusId = 0,
  photos = emptyPhotos,
  onOpenPhotos,
}: {
  points: RecordMapPoint[]
  photos?: MapPhoto[]
  onOpenPhotos?: (ids: string[]) => void
  selectedEventId?: string | null
  onSelect?: (eventId: string) => void
  onPick?: (coordinate: { lat: number; lng: number }) => void
  insets?: RecordMapInsets
  request?: RecordMapRequest | null
  focusId?: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<AMap.Map | null>(null)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef({ points, photos, selectedEventId, onSelect, onPick })
  useEffect(() => {
    latest.current = { points, photos, selectedEventId, onSelect, onPick }
  }, [points, photos, selectedEventId, onSelect, onPick])
  useEffect(() => {
    let disposed = false
    let instance: AMap.Map | null = null
    loadAMap()
      .then((sdk) => {
        if (disposed || !container.current) return
        instance = new sdk.Map(container.current, {
          center: [104.5, 36.5],
          zoom: 4,
          viewMode: "2D",
          mapStyle: PERIPLUS_AMAP_STYLE,
          features: latest.current.onPick
            ? ["bg", "road", "point"]
            : ["bg", "road"],
          animateEnable: false,
        })
        instance.addControl(new sdk.Scale())
        instance.on("click", (event) =>
          latest.current.onPick?.({
            lat: event.lnglat.getLat(),
            lng: event.lnglat.getLng(),
          })
        )
        setMap(instance)
      })
      .catch(() => {
        if (!disposed) setError("地图暂时无法显示，文字和照片仍可正常保存。")
      })
    return () => {
      disposed = true
      instance?.destroy()
    }
  }, [])

  const photoMode = usePhotoMapLayer(
    map,
    photos,
    insets,
    selectedEventId,
    onOpenPhotos
  )
  useEffect(() => {
    if (!map) return
    const markers = points
      .filter(
        (point) => !photos.some((photo) => photo.eventId === point.eventId)
      )
      .map((point, index) => {
        const button = document.createElement("button")
        button.type = "button"
        button.className = `periplus-map-marker periplus-map-marker--ordinal${point.eventId === selectedEventId ? " periplus-map-marker--selected" : ""}`
        button.style.background = periplusColors.russet
        button.textContent = String(point.ordinal || index + 1)
        button.setAttribute("aria-label", `地图地点：${point.title}`)
        const marker = new AMap.Marker({
          position: [point.lng, point.lat],
          content: button,
          anchor: "center",
        })
        marker.on("click", () => latest.current.onSelect?.(point.eventId))
        return marker
      })
    map.add(markers)
    return () => {
      map.remove(markers)
    }
  }, [map, points, selectedEventId, photoMode, photos])
  const fitPoints = [
    ...points,
    ...photos.map((photo) => ({ eventId: photo.eventId, ...photo.coordinate })),
  ]
  const positionKey = fitPoints
    .map((point) => `${point.eventId}:${point.lng}:${point.lat}`)
    .join("|")
  const { left, right, top, bottom } = insets
  useEffect(() => {
    if (!map) return
    const { points, photos, selectedEventId } = latest.current
    const all = [...points, ...photos.map((photo) => photo.coordinate)]
    const selected = points.find((point) => point.eventId === selectedEventId)
    // 将定位点放进浮窗外的可见地图区域；列表滚动、正文修订不触发重新定位。
    if (selected || all.length === 1) {
      const point = selected || all[0]
      map.setZoomAndCenter(14, [point.lng, point.lat])
      map.panBy((left - right) / 2, (top - bottom) / 2)
    } else if (all.length)
      map.setFitView(
        all.map(
          (point) => new AMap.Marker({ position: [point.lng, point.lat] })
        ),
        false,
        [top + (photos.length ? 130 : 0), bottom + 24, left + 72, right + 72],
        14
      )
  }, [map, positionKey, focusId, left, right, top, bottom])
  useEffect(() => {
    if (!map || !request) return
    if (request.type === "zoom-in") map.zoomIn()
    else if (request.type === "zoom-out") map.zoomOut()
    else {
      const all = [
        ...latest.current.points,
        ...latest.current.photos.map((photo) => photo.coordinate),
      ]
      if (all.length)
        map.setFitView(
          all.map(
            (point) => new AMap.Marker({ position: [point.lng, point.lat] })
          ),
          false,
          [
            top + (latest.current.photos.length ? 130 : 0),
            bottom + 24,
            left + 72,
            right + 72,
          ],
          14
        )
    }
  }, [map, request, top, right, bottom, left])
  return (
    <div
      data-photo-mode={photoMode}
      className="relative h-full min-h-72 w-full overflow-hidden bg-cream"
    >
      <div
        ref={container}
        className={`h-full min-h-72 w-full ${onPick ? "cursor-crosshair" : ""}`}
      />
      {error ? (
        <div
          role="status"
          className="absolute right-4 bottom-5 left-4 mx-auto flex max-w-sm items-center gap-3 rounded-xl border border-ink-10 bg-soft-white p-4 text-sm leading-6 text-walnut shadow-periplus-soft"
        >
          <MapPin size={21} className="shrink-0" />
          {error}
        </div>
      ) : null}
      {onPick ? (
        <p className="pointer-events-none absolute inset-x-4 top-4 rounded-xl bg-soft-white p-3 text-sm font-bold shadow-periplus-soft">
          点击地图选择位置
        </p>
      ) : null}
    </div>
  )
}
