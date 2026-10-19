"use client"

import { useEffect, useRef, useState } from "react"
import { MapPin } from "lucide-react"
import { periplusColors } from "@/lib/ui/map-theme"
import { loadAMap, PERIPLUS_AMAP_STYLE } from "@/lib/amap"

export interface RecordMapPoint {
  eventId: string
  title: string
  lat: number
  lng: number
}

export default function RecordMap({
  points,
  selectedEventId,
  onSelect,
  onPick,
}: {
  points: RecordMapPoint[]
  selectedEventId?: string | null
  onSelect?: (eventId: string) => void
  onPick?: (coordinate: { lat: number; lng: number }) => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<AMap.Map | null>(null)
  const [error, setError] = useState<string | null>(null)
  const callbacks = useRef({ onSelect, onPick })
  callbacks.current = { onSelect, onPick }

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
          animateEnable: false,
        })
        instance.addControl(new sdk.Scale())
        instance.on("click", (event) =>
          callbacks.current.onPick?.({
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

  useEffect(() => {
    if (!map) return
    const markers = points.map((point, index) => {
      const content = document.createElement("button")
      content.type = "button"
      content.className = `periplus-map-marker periplus-map-marker--ordinal${point.eventId === selectedEventId ? " periplus-map-marker--selected" : ""}`
      content.style.background = periplusColors.russet
      content.textContent = String(index + 1)
      content.setAttribute("aria-label", point.title)
      const marker = new AMap.Marker({
        position: [point.lng, point.lat],
        content,
        anchor: "center",
      })
      marker.on("click", () => callbacks.current.onSelect?.(point.eventId))
      return marker
    })
    map.add(markers)
    const selected = points.find((point) => point.eventId === selectedEventId)
    if (selected) map.setZoomAndCenter(14, [selected.lng, selected.lat])
    else if (markers.length)
      map.setFitView(markers, false, [40, 40, 40, 40], 14)
    return () => {
      map.remove(markers)
    }
  }, [map, points, selectedEventId])

  return (
    <div className="relative h-full min-h-72 overflow-hidden rounded-xl bg-cream">
      <div
        ref={container}
        className={`h-full min-h-72 w-full ${onPick ? "cursor-crosshair" : ""}`}
      />
      {error ? (
        <div className="absolute inset-0 grid place-content-center gap-3 p-7 text-center text-sm leading-6 text-walnut">
          <MapPin className="mx-auto" />
          {error}
        </div>
      ) : null}
      {!error && !points.length && !onPick ? (
        <p className="absolute inset-x-4 bottom-4 rounded-xl bg-soft-white p-3 text-sm text-walnut shadow-periplus-soft">
          补充记录地点后，会在这里显示。
        </p>
      ) : null}
      {onPick ? (
        <p className="pointer-events-none absolute inset-x-4 top-4 rounded-xl bg-soft-white p-3 text-sm font-bold shadow-periplus-soft">
          点击地图选择位置
        </p>
      ) : null}
    </div>
  )
}
