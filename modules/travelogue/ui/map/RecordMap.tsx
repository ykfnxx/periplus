"use client"

import { useEffect, useRef, useState } from "react"
import type {
  JourneyEvent,
  EventLocation,
} from "@/modules/data-model/contracts/index"
import { recordingCoordinateToMap } from "../formatting/display"
import { Button } from "@/components/kumo/components/button/button"
import { MapPin, Plus } from "lucide-react"
import {
  Map as LibreMap,
  Marker,
  ScaleControl,
  AttributionControl,
} from "maplibre-gl"
import { journalMapStyle } from "@/lib/ui/map-style"
import { MAP_STYLE, fitMapPoints } from "@/lib/map"
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
  type: "zoom-in" | "zoom-out" | "fit" | "fit-date"
  date?: string
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
  const framed = useRef(false)
  const viewportListener = useRef(onViewport)
  useEffect(() => {
    viewportListener.current = onViewport
  }, [onViewport])
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<LibreMap | null>(null)
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
    if (!container.current) return
    let instance: LibreMap | null = null
    let attributionTimer: ReturnType<typeof setTimeout> | undefined
    const resize = new ResizeObserver(() => instance?.resize())
    try {
      instance = new LibreMap({
        container: container.current,
        center: restoredViewport.current
          ? [restoredViewport.current.lng, restoredViewport.current.lat]
          : [104.5, 36.5],
        zoom: restoredViewport.current?.zoom ?? 4,
        style: MAP_STYLE,
        transformStyle: (_previous, next) => journalMapStyle(next),
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      })
      const current = instance
      current.addControl(
        new AttributionControl({ compact: true }),
        "bottom-left"
      )
      current.addControl(new ScaleControl(), "bottom-left")
      current.on("error", () =>
        setError("地图暂时无法显示，文字和照片仍可正常保存。")
      )
      current.on("idle", () => setError(null))
      current.on("contextmenu", (event) => {
        if (!latest.current.onAddAtLocation) return
        setContext({
          lat: event.lngLat.lat,
          lng: event.lngLat.wrap().lng,
          x: Math.max(
            12,
            Math.min(event.point.x, current.getContainer().clientWidth - 192)
          ),
          y: Math.max(
            12,
            Math.min(event.point.y, current.getContainer().clientHeight - 64)
          ),
        })
      })
      current.on("movestart", () => setContext(null))
      current.on("moveend", () => {
        const center = current.getCenter()
        viewportListener.current?.({
          lat: center.lat,
          lng: center.lng,
          zoom: current.getZoom(),
        })
      })
      current.on("click", (event) => {
        setContext(null)
        latest.current.onPick?.({
          lat: event.lngLat.lat,
          lng: event.lngLat.wrap().lng,
        })
      })
      // Layers must be added only after the remote style has loaded.
      current.on("load", () => {
        setMap(current)
        attributionTimer = setTimeout(() => {
          current
            .getContainer()
            .querySelector(".maplibregl-ctrl-attrib")
            ?.classList.remove("maplibregl-compact-show")
        }, 5000)
      })
      resize.observe(container.current)
    } catch {
      // WebGL initialization can fail before MapLibre emits an error event.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("地图暂时无法显示，文字和照片仍可正常保存。")
    }
    return () => {
      clearTimeout(attributionTimer)
      resize.disconnect()
      instance?.remove()
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
        button.style.background = periplusColors.mapMarker
        button.textContent = String(point.ordinal || index + 1)
        button.setAttribute("aria-label", `地图地点：${point.title}`)
        const marker = new Marker({ element: button, anchor: "center" })
          .setLngLat([point.lng, point.lat])
          .addTo(map)
        button.onclick = (event) => {
          event.stopPropagation()
          if (latest.current.onPick)
            latest.current.onPick({ lat: point.lat, lng: point.lng })
          else latest.current.onSelect?.(point.eventId)
        }
        return marker
      })
    return () => {
      markers.forEach((marker) => marker.remove())
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
    content.style.zIndex = "200"
    const marker = new Marker({ element: content, anchor: "bottom" })
      .setLngLat([point.lng, point.lat])
      .addTo(map)
    return () => {
      marker.remove()
    }
  }, [map, picking, pickedLocation, context])
  useEffect(() => {
    if (!map) return
    map.getCanvas().style.cursor = picking ? "crosshair" : ""

    // 只在进入选点时定位；之后平移、缩放和点击都保留当前镜头。
    const coordinate = pickedLocation?.coordinates
    if (picking && coordinate) {
      const point = recordingCoordinateToMap(coordinate)
      map.jumpTo({
        zoom: Math.max(14, map.getZoom()),
        center: [point.lng, point.lat],
      })
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
  const photoPadding =
    map && map.getContainer().clientHeight - top - bottom < 160 ? 30 : 130
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
      framed.current = true
      fitMapPoints(
        map,
        routeBounds.map(([lng, lat]) => ({ lng, lat })),
        {
          top: top + 24,
          bottom: bottom + 24,
          left: left + 72,
          right: right + 72,
        },
        14
      )

      return
    }
    if (selectedEventId && !selected && !selectedPhoto && framed.current) return
    // 将定位点放进浮窗外的可见地图区域；列表滚动、正文修订不触发重新定位。
    if (selected || selectedPhoto || all.length === 1) {
      framed.current = true
      const point = selected || selectedPhoto?.coordinate || all[0]
      map.easeTo({
        center: [point.lng, point.lat],
        zoom: 14,
        duration: 0,
        offset: [
          (left - right) / 2,
          (top + (selectedPhoto ? photoPadding : 0) - bottom) / 2,
        ],
      })
    } else if (all.length) {
      framed.current = true
      fitMapPoints(
        map,
        all,
        {
          top: top + (photos.length ? photoPadding : 0),
          bottom: bottom + 24,
          left: left + 72,
          right: right + 72,
        },
        14
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, positionKey, focusId, left, right, top, bottom, photoPadding])
  useEffect(() => {
    if (!map || !request) return
    if (request.type === "zoom-in") map.zoomIn()
    else if (request.type === "zoom-out") map.zoomOut()
    else if (request.type === "fit-date") {
      const dayEvents = latest.current.events.filter(
        (event) => event.date === request.date
      )
      const dayIds = new Set(dayEvents.map((event) => event.id))
      const dayPhotos = latest.current.photos.filter((photo) =>
        dayIds.has(photo.eventId)
      )
      const dayPoints = [
        ...latest.current.points.filter((point) => dayIds.has(point.eventId)),
        ...dayEvents.flatMap((event) =>
          eventRouteBounds(event).map(([lng, lat]) => ({ lng, lat }))
        ),
        ...dayPhotos.map((photo) => photo.coordinate),
      ]
      if (dayPoints.length)
        fitMapPoints(
          map,
          dayPoints,
          {
            top: top + (dayPhotos.length ? photoPadding : 24),
            bottom: bottom + 24,
            left: left + 72,
            right: right + 72,
          },
          14
        )
    } else {
      const all = [
        ...latest.current.points,
        ...latest.current.events.flatMap((event) =>
          eventRouteBounds(event).map(([lng, lat]) => ({ lng, lat }))
        ),
        ...latest.current.photos.map((photo) => photo.coordinate),
      ]
      if (all.length)
        fitMapPoints(
          map,
          all,
          {
            top: top + (latest.current.photos.length ? photoPadding : 0),
            bottom: bottom + 24,
            left: left + 72,
            right: right + 72,
          },
          14
        )
    }
  }, [map, request, top, right, bottom, left, photoPadding])
  return (
    <div
      data-map-picking={picking}
      data-photo-mode={photoMode}
      className="relative h-full min-h-72 w-full overflow-hidden bg-map-land"
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
                  coordinateSystem: "WGS84",
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
