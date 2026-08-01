"use client"

import { useEffect } from "react"
import { plannedLocationOf } from "@/lib/journeys/locations"
import { getJourneyScopeProjection } from "@/lib/journeys/projections"
import type { MapIntent } from "@/modules/workspace/contracts"
import { selectWorkspaceGraph } from "@/modules/workspace/state/selectors"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { periplusColors, routeMarkerColors } from "@/lib/ui/map-theme"

interface RouteMarkersProps {
  onIntent?: (intent: MapIntent) => void
}

export default function RouteMarkers({ onIntent }: RouteMarkersProps) {
  const map = useWorkspaceStore((state) => state.map)
  const graph = useWorkspaceStore(selectWorkspaceGraph)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeSectionEventId = useWorkspaceStore(
    (state) => state.activeSectionEventId
  )
  const hoveredEventId = useWorkspaceStore((state) => state.hoveredEventId)
  const selectedLocationEvent = useWorkspaceStore(
    (state) => state.selectedLocationEvent
  )

  useEffect(() => {
    if (!map || !graph) return
    const view = getJourneyScopeProjection(
      graph,
      viewLevel,
      activeSectionEventId
    )
    const points = view.items
      .map(({ event, resolved }) => ({
        event,
        resolved,
        location: plannedLocationOf(event),
      }))
      .filter(
        (
          item
        ): item is {
          event: (typeof view.locations)[number]
          resolved: (typeof view.resolvedEvents)[number] & {
            locationOrdinal: number
          }
          location: NonNullable<ReturnType<typeof plannedLocationOf>>
        } =>
          Boolean(item.location) && item.resolved.locationOrdinal !== undefined
      )
    const markers: AMap.Marker[] = []
    const longPressTimers: Array<ReturnType<typeof setTimeout>> = []

    points.forEach(({ event, resolved, location }) => {
      const content = document.createElement("div")
      content.className = [
        "periplus-map-marker",
        "periplus-map-marker--bright",
        hoveredEventId === event.id ? "periplus-map-marker--hovered" : "",
        selectedLocationEvent?.id === event.id
          ? "periplus-map-marker--selected"
          : "",
      ]
        .filter(Boolean)
        .join(" ")
      content.setAttribute("role", "button")
      content.setAttribute("aria-label", `选择地点 ${event.title}`)
      const markerPosition = resolved.locationOrdinal
      const colorIndex =
        (resolved.locationOrdinal - 1) % routeMarkerColors.length
      content.style.background =
        view.level === "overview"
          ? routeMarkerColors[colorIndex]
          : periplusColors.routeBlue
      content.style.color =
        view.level === "overview" && colorIndex === 2
          ? periplusColors.ink
          : periplusColors.white
      content.textContent = `${markerPosition}`

      const marker = new AMap.Marker({
        content,
        position: new AMap.LngLat(location.lng, location.lat),
        title: event.title,
        offset: new AMap.Pixel(-18, -18),
      })
      marker.on("click", (mapEvent) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(mapEvent as any).stopPropagation?.()
        onIntent?.({ type: "map.event-selected", eventId: event.id })
      })
      marker.on("mouseover", () => {
        onIntent?.({ type: "map.event-hovered", eventId: event.id })
      })
      marker.on("mouseout", () => {
        onIntent?.({ type: "map.event-hover-cleared", eventId: event.id })
      })
      marker.on("touchstart", () => {
        longPressTimers.push(
          setTimeout(() => {
            onIntent?.({ type: "map.event-selected", eventId: event.id })
          }, 500)
        )
      })
      marker.on("touchmove", () => {
        longPressTimers.splice(0).forEach(clearTimeout)
      })
      marker.on("touchend", () => {
        longPressTimers.splice(0).forEach(clearTimeout)
      })
      markers.push(marker)
    })

    if (markers.length) map.add(markers)
    return () => {
      longPressTimers.splice(0).forEach(clearTimeout)
      if (markers.length) map.remove(markers)
    }
  }, [
    map,
    graph,
    viewLevel,
    activeSectionEventId,
    hoveredEventId,
    selectedLocationEvent,
    onIntent,
  ])

  return null
}
