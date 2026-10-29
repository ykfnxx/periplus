"use client"

import { useEffect } from "react"
import { effectiveLocationOf } from "@/lib/journeys/locations"
import { eventRouteBounds } from "@/lib/journeys/route-paths"
import { photoItems } from "@/modules/travelogue/ui/photo-items"
import {
  selectWorkspaceJourney,
  useWorkspaceViewportInsets,
} from "@/modules/workspace/state/selectors"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { toAMapAvoid } from "@/modules/workspace/viewport"

export default function MapViewportController() {
  const map = useWorkspaceStore((state) => state.map)
  const journey = useWorkspaceStore(selectWorkspaceJourney)
  const focus = useWorkspaceStore((state) => state.mapFocusRequest)
  const clear = useWorkspaceStore((state) => state.clearMapFocusRequest)
  const insets = useWorkspaceViewportInsets()
  useEffect(() => {
    if (!map || !journey || !focus) return
    const target = focus.target
    const event =
      target.type !== "active-journey"
        ? journey.events.find((event) => event.id === target.eventId)
        : undefined
    const location = effectiveLocationOf(event)
    if (target.type === "event") {
      const point =
        location ??
        (event &&
          photoItems([event]).find((photo) => photo.coordinate)?.coordinate)
      if (point) {
        map.setZoomAndCenter(target.zoom, [point.lng, point.lat])
        map.panBy(
          (insets.left - insets.right) / 2,
          (insets.top - insets.bottom) / 2
        )
      }
    } else {
      const positions: [number, number][] =
        target.type === "transit"
          ? event
            ? eventRouteBounds(event)
            : []
          : [
              ...journey.events.flatMap((event): [number, number][] => {
                const point = effectiveLocationOf(event)
                return [
                  ...(point
                    ? [[point.lng, point.lat] as [number, number]]
                    : []),
                  ...eventRouteBounds(event),
                ]
              }),
              ...photoItems(journey.events).flatMap(
                (photo): [number, number][] =>
                  photo.coordinate
                    ? [[photo.coordinate.lng, photo.coordinate.lat]]
                    : []
              ),
            ]
      if (positions.length) {
        const markers = positions.map(
          (position) => new AMap.Marker({ position, visible: false })
        )
        map.setFitView(markers, true, toAMapAvoid(insets), target.maxZoom)
      }
    }
    clear(focus.requestId)
  }, [map, journey, focus, clear, insets])
  return null
}
