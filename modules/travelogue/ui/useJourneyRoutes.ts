"use client"

import { useEffect } from "react"
import type { JourneyEvent } from "@/modules/data-model/contracts"
import { segmentMapPath } from "@/lib/journeys/route-paths"
import {
  getRouteSegmentStyle,
  periplusColors,
  trafficSectionColors,
} from "@/lib/ui/map-theme"

export default function useJourneyRoutes(
  map: AMap.Map | null,
  events: readonly JourneyEvent[],
  selectedEventId: string | null | undefined,
  onSelect?: (eventId: string) => void
) {
  useEffect(() => {
    if (!map) return
    const overlays: AMap.Polyline[] = []
    for (const event of events) {
      if (event.transit?.routeState !== "READY") continue
      const plan = event.transit.route?.plans[0]
      if (!plan) continue
      const selected = event.id === selectedEventId
      for (const segment of plan.segments) {
        const path = segmentMapPath(segment)
        if (path.length < 2) continue
        const style = getRouteSegmentStyle(segment.mode)
        const line = new AMap.Polyline({
          path,
          strokeColor: periplusColors.routeBlue,
          strokeWeight: selected ? 9 : 7,
          strokeOpacity: selectedEventId && !selected ? 0.4 : 0.96,
          strokeStyle:
            segment.geometryKind === "SCHEMATIC" ? "dashed" : style.strokeStyle,
          strokeDasharray:
            segment.geometryKind === "SCHEMATIC" ? [10, 8] : style.dasharray,
          showDir: segment.geometryKind !== "SCHEMATIC",
          zIndex: selected ? 120 : 95,
        })
        line.on("click", () => onSelect?.(event.id))
        overlays.push(line)
        for (const traffic of segment.trafficSections ?? []) {
          const path = segmentMapPath(segment, traffic.positions)
          if (path.length < 2) continue
          const line = new AMap.Polyline({
            path,
            strokeColor: trafficSectionColors[traffic.status],
            strokeWeight: selected ? 9 : 7,
            zIndex: selected ? 121 : 96,
          })
          line.on("click", () => onSelect?.(event.id))
          overlays.push(line)
        }
      }
    }
    if (overlays.length) map.add(overlays)
    return () => {
      if (overlays.length) map.remove(overlays)
    }
  }, [map, events, selectedEventId, onSelect])
}
