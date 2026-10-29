"use client"

import { useEffect, useRef, useState } from "react"
import type {
  JourneyEvent,
  EventLocation,
} from "@/modules/data-model/contracts"
import { recordingCoordinateToMap } from "./display"
import { Button } from "@/components/kumo/components/button/button"
import { MapPin, Plus } from "lucide-react"
import { loadAMap, PERIPLUS_AMAP_STYLE } from "@/lib/amap"
import usePhotoMapLayer, { type MapPhoto } from "./usePhotoMapLayer"
import type { MapViewport } from "../state/atlas-view-store"
import useJourneyRoutes from "./useJourneyRoutes"
import { eventRouteBounds } from "@/lib/journeys/route-paths"
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
const emptyEvents: JourneyEvent[] = []
const defaultInsets: RecordMapInsets = {
  left: 40,
  right: 40,
  top: 40,
  bottom: 40,
}

export default function RecordMap({
  points,
  events = emptyEvents,
  selectedEventId,
  onSelect,
  onPick,
  picking = false,
  pickedLocation,
  onAddAtLocation,
  insets = defaultInsets,
  request,
  focusId = 0,
  photos = emptyPhotos,
  onOpenPhotos,
  initialViewport,
  onViewport,
}: {
  initialViewport?: MapViewport | null
  onViewport?: (viewport: MapViewport) => void
  points: RecordMapPoint[]
  events?: JourneyEvent[]
  photos?: MapPhoto[]
  onOpenPhotos?: (ids: string[]) => void
  selectedEventId?: string | null
  onSelect?: (eventId: string) => void
  onPick?: (coordinate: { lat: number; lng: number }) => void
  picking?: boolean
  pickedLocation?: EventLocation | null
  onAddAtLocation?: (location: EventLocation) => void
  insets?: RecordMapInsets
  request?: RecordMapRequest | null
  focusId?: number
}) {
  const restoredViewport = useRef(initialViewport)
  const viewportListener = useRef(onViewport)
  useEffect(() => {
    viewportListener.current = onViewport
  }, [onViewport])
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<AMap.Map | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [context, setContext] = useState<{
    lat: number
    lng: number
    x: number
    y: number
  } | null>(null)
  const contextButton = useRef<HTMLButtonElement>(null)
  const latest = useRef({
    points,
    events,
    photos,
    selectedEventId,
    onSelect,
    onPick,
    onAddAtLocation,
  })
  useEffect(() => {
    latest.current = {
      points,
      events,
      photos,
      selectedEventId,
      onSelect,
      onPick,
      onAddAtLocation,
    }
  }, [
    points,
    events,
    photos,
    selectedEventId,
    onSelect,
    onPick,
    onAddAtLocation,
  ])
  useEffect(() => {
    let disposed = false
    let instance: AMap.Map | null = null
    loadAMap()
      .then((sdk) => {
        if (disposed || !container.current) return
        instance = new sdk.Map(container.current, {
          center: restoredViewport.current
            ? [restoredViewport.current.lng, restoredViewport.current.lat]
            : [104.5, 36.5],
          zoom: restoredViewport.current?.zoom ?? 4,
          viewMode: "2D",
          mapStyle: PERIPLUS_AMAP_STYLE,
          features: latest.current.onPick
            ? ["bg", "road", "point"]
            : ["bg", "road"],
          animateEnable: false,
        })
        instance.addControl(new sdk.Scale())
        instance.on("rightclick", (event) => {
          if (!latest.current.onAddAtLocation) return
          const pixel = instance!.lngLatToContainer(event.lnglat)
          setContext({
            lat: event.lnglat.getLat(),
            lng: event.lnglat.getLng(),
            x: Math.max(
              12,
              Math.min(pixel.getX(), container.current!.clientWidth - 192)
            ),
            y: Math.max(
              12,
              Math.min(pixel.getY(), container.current!.clientHeight - 64)
            ),
          })
        })
        instance.on("movestart", () => setContext(null))
        instance.on("moveend", () => {
          const center = instance!.getCenter()
          viewportListener.current?.({
            lat: center.getLat(),
            lng: center.getLng(),
            zoom: instance!.getZoom(),
          })
        })
        instance.on("click", (event) => {
          setContext(null)
          latest.current.onPick?.({
            lat: event.lnglat.getLat(),
            lng: event.lnglat.getLng(),
          })
        })
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

  useJourneyRoutes(map, events, selectedEventId, onSelect)
  const photoMode = usePhotoMapLayer(
    map,
    photos,
    insets,
    selectedEventId,
    onOpenPhotos,
    !picking
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
        marker.on("click", () => {
          if (latest.current.onPick)
            latest.current.onPick({ lat: point.lat, lng: point.lng })
          else latest.current.onSelect?.(point.eventId)
        })
        return marker
      })
    map.add(markers)
    return () => {
      map.remove(markers)
    }
  }, [map, points, selectedEventId, photoMode, photos])
  useEffect(() => {
    const coordinate =
      context ||
      (picking && pickedLocation?.coordinates
        ? recordingCoordinateToMap(pickedLocation.coordinates)
        : null)
    if (!map || !coordinate) return
    const point = coordinate
    const content = document.createElement("div")
    content.className = "journal-picked-pin"
    const dot = document.createElement("span")
    dot.className = "journal-picked-pin-dot"
    const label = document.createElement("span")
    label.className = "journal-picked-pin-label"
    label.textContent = picking
      ? pickedLocation?.name || "所选位置"
      : "所选位置"
    content.append(label, dot)
    const marker = new AMap.Marker({
      position: [point.lng, point.lat],
      content,
      anchor: "bottom-center",
      zIndex: 200,
    })
    map.add(marker)
    return () => {
      map.remove(marker)
    }
  }, [map, picking, pickedLocation, context])
  useEffect(() => {
    if (!map) return
    map.setDefaultCursor(picking ? "crosshair" : "")

    // 只在进入选点时定位；之后平移、缩放和点击都保留当前镜头。
    const coordinate = pickedLocation?.coordinates
    if (picking && coordinate) {
      const point = recordingCoordinateToMap(coordinate)
      map.setZoomAndCenter(Math.max(14, map.getZoom()), [point.lng, point.lat])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, picking])
  useEffect(() => {
    if (!context) return
    contextButton.current?.focus({ preventScroll: true })
    const dismiss = (event: PointerEvent) => {
      if (!contextButton.current?.contains(event.target as Node))
        setContext(null)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setContext(null)
        container.current?.focus({ preventScroll: true })
      }
    }
    document.addEventListener("pointerdown", dismiss)
    document.addEventListener("keydown", escape)
    return () => {
      document.removeEventListener("pointerdown", dismiss)
      document.removeEventListener("keydown", escape)
    }
  }, [context])
  const fitPoints = [
    ...points,
    ...events.flatMap((event) =>
      eventRouteBounds(event).map(([lng, lat]) => ({
        eventId: event.id,
        lng,
        lat,
      }))
    ),
    ...photos.map((photo) => ({ eventId: photo.eventId, ...photo.coordinate })),
  ]
  const positionKey = fitPoints
    .map((point) => `${point.eventId}:${point.lng}:${point.lat}`)
    .join("|")
  const { left, right, top, bottom } = insets
  useEffect(() => {
    if (!map || picking || restoredViewport.current) return
    const { points, events, photos, selectedEventId } = latest.current
    const all = [
      ...points,
      ...photos.map((photo) => photo.coordinate),
      ...events.flatMap((event) =>
        eventRouteBounds(event).map(([lng, lat]) => ({ lng, lat }))
      ),
    ]
    const selectedRoute = events.find((event) => event.id === selectedEventId)
    const routeBounds = selectedRoute ? eventRouteBounds(selectedRoute) : []
    const selected = points.find((point) => point.eventId === selectedEventId)
    // 无定位的记录保留当前镜头；有独立照片位置时优先使用该记录的照片。
    const selectedPhoto = photos.find(
      (photo) => photo.eventId === selectedEventId
    )
    if (routeBounds.length) {
      map.setFitView(
        routeBounds.map((position) => new AMap.Marker({ position })),
        false,
        [top + 24, bottom + 24, left + 72, right + 72],
        14
      )
      return
    }
    if (selectedEventId && !selected && !selectedPhoto) return
    // 将定位点放进浮窗外的可见地图区域；列表滚动、正文修订不触发重新定位。
    if (selected || selectedPhoto || all.length === 1) {
      const point = selected || selectedPhoto?.coordinate || all[0]
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, positionKey, focusId, left, right, top, bottom])
  useEffect(() => {
    if (!map || !request) return
    if (request.type === "zoom-in") map.zoomIn()
    else if (request.type === "zoom-out") map.zoomOut()
    else {
      const all = [
        ...latest.current.points,
        ...latest.current.events.flatMap((event) =>
          eventRouteBounds(event).map(([lng, lat]) => ({ lng, lat }))
        ),
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
      data-map-picking={picking}
      data-photo-mode={photoMode}
      className="relative h-full min-h-72 w-full overflow-hidden bg-cream"
    >
      <div
        ref={container}
        tabIndex={0}
        aria-label="旅程地图"
        onContextMenu={(event) => {
          if (onAddAtLocation || picking) event.preventDefault()
        }}
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
      {context && onAddAtLocation && !picking && (
        <div
          className="absolute z-30"
          style={{
            left: context.x,
            top: context.y,
          }}
        >
          <Button
            ref={contextButton}
            variant="secondary"
            className="min-h-12 rounded-xl! bg-white! px-5! shadow-periplus"
            onClick={() => {
              onAddAtLocation({
                name: "所选位置",
                address: null,
                coordinates: {
                  lat: context.lat,
                  lng: context.lng,
                  coordinateSystem: "GCJ02",
                },
              })
              setContext(null)
            }}
          >
            <Plus size={16} />
            在此添加记录
          </Button>
        </div>
      )}
    </div>
  )
}
