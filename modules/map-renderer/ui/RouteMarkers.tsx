"use client"

import { useEffect } from "react"
import { deriveJourneyDayGroups } from "@/lib/journeys/day-groups"
import { effectiveLocationOf } from "@/lib/journeys/locations"
import type { MapIntent } from "@/modules/workspace/contracts"
import { selectWorkspaceJourney } from "@/modules/workspace/state/selectors"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { getRouteDayColor } from "@/lib/ui/map-theme"
import { eventTitle } from "@/modules/travelogue/ui/display"

export default function RouteMarkers({
  onIntent,
}: {
  onIntent?: (intent: MapIntent) => void
}) {
  const map = useWorkspaceStore((state) => state.map)
  const journey = useWorkspaceStore(selectWorkspaceJourney)
  const hoveredEventId = useWorkspaceStore((state) => state.hoveredEventId)
  const selectedEventId = useWorkspaceStore((state) => state.selectedEventId)

  useEffect(() => {
    if (!map || !journey) return
    const days = deriveJourneyDayGroups(journey.events)
    const dayByKey = new Map(days.groups.map((group) => [group.key, group]))
    const markers = journey.events.flatMap((event, index) => {
      const location = effectiveLocationOf(event)
      if (
        !location ||
        event.photos.some(
          (photo) => (photo.location ?? event.location)?.coordinates
        )
      )
        return []
      const content = document.createElement("button")
      content.type = "button"
      content.className = [
        "periplus-map-marker periplus-map-marker--ordinal",
        hoveredEventId === event.id ? "periplus-map-marker--hovered" : "",
        selectedEventId === event.id ? "periplus-map-marker--selected" : "",
      ]
        .filter(Boolean)
        .join(" ")
      content.setAttribute("aria-label", `选择地点 ${eventTitle(event)}`)
      content.setAttribute("aria-pressed", String(selectedEventId === event.id))
      const dayKey = days.groupKeyByEventId.get(event.id)
      content.style.background = getRouteDayColor(
        dayByKey.get(dayKey ?? "")?.colorIndex ?? null
      )
      content.textContent = String(index + 1)
      content.dataset.routeEventPosition = String(index + 1)
      const select = (click: MouseEvent) => {
        click.stopPropagation()
        onIntent?.({ type: "map.event-selected", eventId: event.id })
      }
      content.addEventListener("click", select)
      content.addEventListener("mouseenter", () =>
        onIntent?.({ type: "map.event-hovered", eventId: event.id })
      )
      content.addEventListener("mouseleave", () =>
        onIntent?.({ type: "map.event-hover-cleared", eventId: event.id })
      )
      const marker = new AMap.Marker({
        content,
        position: [location.lng, location.lat],
        title: eventTitle(event),
        anchor: "center",
      })
      return [marker]
    })
    if (markers.length) map.add(markers)
    return () => {
      if (markers.length) map.remove(markers)
    }
  }, [map, journey, hoveredEventId, selectedEventId, onIntent])
  return null
}
