"use client"

import { useEffect } from "react"
import { deriveJourneyDayGroups } from "@/lib/journeys/day-groups"
import { plannedLocationOf } from "@/lib/journeys/locations"
import { getJourneyScopeProjection } from "@/lib/journeys/projections"
import type { MapIntent } from "@/modules/workspace/contracts"
import { selectWorkspaceJourneyView } from "@/modules/workspace/state/selectors"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import {
  getRouteDayColor,
  periplusColors,
  routeMarkerColors,
} from "@/lib/ui/map-theme"

interface RouteMarkersProps {
  onIntent?: (intent: MapIntent) => void
}

export default function RouteMarkers({ onIntent }: RouteMarkersProps) {
  const map = useWorkspaceStore((state) => state.map)
  const graph = useWorkspaceStore(selectWorkspaceJourneyView)
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
    const dayProjection =
      view.level === "section" && view.section?.detail.kind === "CITY"
        ? deriveJourneyDayGroups(view.events, view.section.detail.timeZone)
        : null
    const dayGroupByKey = new Map(
      dayProjection?.groups.map((group) => [group.key, group])
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
        view.level === "overview"
          ? "periplus-map-marker--bright"
          : "periplus-map-marker--ordinal",
        hoveredEventId === event.id ? "periplus-map-marker--hovered" : "",
        selectedLocationEvent?.id === event.id
          ? "periplus-map-marker--selected"
          : "",
      ]
        .filter(Boolean)
        .join(" ")
      content.setAttribute("role", "button")
      content.setAttribute("aria-label", `选择地点 ${event.title}`)
      const colorIndex =
        (resolved.locationOrdinal - 1) % routeMarkerColors.length
      const dayKey = dayProjection?.groupKeyByEventId.get(event.id)
      const dayGroup = dayKey ? dayGroupByKey.get(dayKey) : undefined
      const dayColor =
        dayGroup !== undefined
          ? getRouteDayColor(dayGroup.colorIndex)
          : periplusColors.routeBlue
      content.style.background =
        view.level === "overview" ? routeMarkerColors[colorIndex] : dayColor
      content.style.color =
        view.level === "section"
          ? periplusColors.white
          : colorIndex === 2
            ? periplusColors.ink
            : periplusColors.white
      if (dayKey) content.dataset.routeDayKey = dayKey
      if (dayGroup) {
        content.dataset.dayColorIndex = String(dayGroup.colorIndex)
      }
      content.dataset.routeEventPosition = String(resolved.resolvedPosition + 1)
      content.textContent =
        view.level === "section"
          ? String(resolved.resolvedPosition + 1)
          : routeMarkerLabel(event)

      const marker = new AMap.Marker({
        content,
        position: new AMap.LngLat(location.lng, location.lat),
        title: event.title,
        offset:
          view.level === "section"
            ? new AMap.Pixel(-17, -17)
            : new AMap.Pixel(-18, -15),
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

function routeMarkerLabel(
  event: ReturnType<typeof getJourneyScopeProjection>["locations"][number]
) {
  if (event.type === "SECTION") return event.title.slice(0, 2)
  if (event.type === "VISIT") return "景点"
  if (event.type === "MEAL") return "餐饮"
  if (event.type === "STAY") return "住宿"
  return "活动"
}
