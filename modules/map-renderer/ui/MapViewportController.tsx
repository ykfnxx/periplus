"use client"

import { useEffect } from "react"
import { getEdgePathPositions } from "@/lib/journeys/transit-geometry"
import { plannedLocationOf } from "@/lib/journeys/locations"
import { selectedTransitPlan } from "@/lib/journeys/planning"
import { getJourneyScopeProjection } from "@/lib/journeys/projections"
import { useWorkspaceViewportInsets } from "@/modules/workspace/state/selectors"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { toAMapAvoid } from "@/modules/workspace/viewport"

function offsetForInsets(
  insets: ReturnType<typeof useWorkspaceViewportInsets>
) {
  return {
    x: (insets.left - insets.right) / 2,
    y: (insets.top - insets.bottom) / 2,
  }
}

export default function MapViewportController() {
  const map = useWorkspaceStore((state) => state.map)
  const draftJourney = useWorkspaceStore((state) => state.draftJourney)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeSectionEventId = useWorkspaceStore(
    (state) => state.activeSectionEventId
  )
  const focusRequest = useWorkspaceStore((state) => state.mapFocusRequest)
  const clearMapFocusRequest = useWorkspaceStore(
    (state) => state.clearMapFocusRequest
  )
  const viewportInsets = useWorkspaceViewportInsets()

  useEffect(() => {
    if (!map || !draftJourney || !focusRequest) return
    const view = getJourneyScopeProjection(
      draftJourney,
      viewLevel,
      activeSectionEventId
    )
    const eventById = new Map(
      draftJourney.events.map((event) => [event.id, event])
    )
    const { target } = focusRequest

    if (target.type === "event") {
      const location = plannedLocationOf(eventById.get(target.eventId))
      if (location) {
        map.setZoomAndCenter(
          target.zoom,
          new AMap.LngLat(location.lng, location.lat)
        )
        const offset = offsetForInsets(viewportInsets)
        map.panBy(offset.x, offset.y)
      }
      clearMapFocusRequest(focusRequest.requestId)
      return
    }

    const overlays: Array<AMap.Polyline | AMap.Marker> = []
    if (target.type === "transit") {
      const transit = view.transits.find((event) => event.id === target.eventId)
      if (transit) {
        const from = plannedLocationOf(
          eventById.get(transit.detail.plannedFromEventId ?? "")
        )
        const to = plannedLocationOf(
          eventById.get(transit.detail.plannedToEventId ?? "")
        )
        if (from && to) {
          const selected = selectedTransitPlan(transit)
          const positions =
            selected?.segments.flatMap((segment) => segment.positions) ??
            getEdgePathPositions(from, to, transit.detail.transportMode)
          overlays.push(
            new AMap.Polyline({
              path: positions.map(([lng, lat]) => new AMap.LngLat(lng, lat)),
              strokeOpacity: 0,
            })
          )
        }
      }
    }
    if (target.type === "active-journey") {
      overlays.push(
        ...view.locations.flatMap((event) => {
          const location = plannedLocationOf(event)
          return location
            ? [
                new AMap.Marker({
                  position: new AMap.LngLat(location.lng, location.lat),
                  visible: false,
                }),
              ]
            : []
        })
      )
    }
    if (overlays.length) {
      map.add(overlays)
      map.setFitView(
        overlays,
        false,
        toAMapAvoid(viewportInsets),
        target.maxZoom
      )
      map.remove(overlays)
    }
    clearMapFocusRequest(focusRequest.requestId)
  }, [
    activeSectionEventId,
    clearMapFocusRequest,
    draftJourney,
    focusRequest,
    map,
    viewLevel,
    viewportInsets,
  ])

  return null
}
