"use client"

import { useEffect } from "react"
import { getEdgePathPositions } from "@/lib/journeys/transit-geometry"
import { plannedLocationOf } from "@/lib/journeys/locations"
import { selectedTransitPlan } from "@/lib/journeys/planning"
import { getJourneyScopeProjection } from "@/lib/journeys/projections"
import {
  getRouteSegmentStyle,
  periplusColors,
  trafficSectionColors,
} from "@/lib/ui/map-theme"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { MapIntent } from "@/modules/workspace/contracts"
import type { JourneyLngLat, TransitEvent, TransitPlan } from "@/types/journey"

function lngLatPath(positions: JourneyLngLat[]) {
  return positions.map(([lng, lat]) => new AMap.LngLat(lng, lat))
}

export default function RoutePolyline({
  onIntent,
}: {
  onIntent?: (intent: MapIntent) => void
}) {
  const map = useWorkspaceStore((state) => state.map)
  const draftJourney = useWorkspaceStore((state) => state.draftJourney)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeSectionEventId = useWorkspaceStore(
    (state) => state.activeSectionEventId
  )
  const selectedTransitEventId = useWorkspaceStore(
    (state) => state.selectedTransitEventId
  )

  useEffect(() => {
    if (!map || !draftJourney) return
    const view = getJourneyScopeProjection(
      draftJourney,
      viewLevel,
      activeSectionEventId
    )
    const eventById = new Map(
      draftJourney.events.map((event) => [event.id, event])
    )
    const polylines: AMap.Polyline[] = []
    const transferMarkers: AMap.Marker[] = []
    const bindSelection = (polyline: AMap.Polyline, event: TransitEvent) => {
      polyline.on("click", (mapEvent) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(mapEvent as any).stopPropagation?.()
        onIntent?.({ type: "map.transit-selected", eventId: event.id })
      })
    }

    for (const event of view.transits) {
      const from = plannedLocationOf(
        eventById.get(event.detail.plannedFromEventId ?? "")
      )
      const to = plannedLocationOf(
        eventById.get(event.detail.plannedToEventId ?? "")
      )
      if (!from || !to) continue
      const selected = selectedTransitPlan(event)
      const isSelected = selectedTransitEventId === event.id
      const isDimmed = selectedTransitEventId !== null && !isSelected
      if (selected?.segments.some((segment) => segment.positions.length >= 2)) {
        if (isSelected) {
          for (const candidate of event.detail.plans ?? []) {
            if (candidate.id !== selected.id)
              drawCandidate(candidate, polylines)
          }
        }
        drawSelectedPlan(
          selected,
          event,
          isSelected,
          isDimmed,
          polylines,
          transferMarkers,
          bindSelection
        )
        continue
      }
      const positions = getEdgePathPositions(
        from,
        to,
        event.detail.transportMode
      )
      const fallback = new AMap.Polyline({
        path: lngLatPath(positions),
        strokeColor: periplusColors.routeBluePending,
        strokeWeight: isSelected ? 7 : 6,
        strokeOpacity:
          event.detail.planningStatus === "FAILED" || isDimmed ? 0.25 : 0.9,
        strokeStyle: "dashed",
        strokeDasharray: [10, 9],
        lineJoin: "round",
        lineCap: "round",
        zIndex: isSelected ? 120 : 70,
      })
      bindSelection(fallback, event)
      polylines.push(fallback)
    }

    const overlays = [...polylines, ...transferMarkers]
    if (overlays.length) map.add(overlays)
    return () => {
      if (overlays.length) map.remove(overlays)
    }
  }, [
    map,
    draftJourney,
    viewLevel,
    activeSectionEventId,
    selectedTransitEventId,
    onIntent,
  ])
  return null
}

function drawCandidate(plan: TransitPlan, polylines: AMap.Polyline[]) {
  for (const segment of plan.segments) {
    if (segment.positions.length < 2) continue
    polylines.push(
      new AMap.Polyline({
        path: lngLatPath(segment.positions),
        strokeColor: periplusColors.routeAlternative,
        strokeWeight: 4,
        strokeOpacity: 0.42,
        strokeStyle: segment.geometryKind === "SCHEMATIC" ? "dashed" : "solid",
        strokeDasharray:
          segment.geometryKind === "SCHEMATIC" ? [10, 8] : undefined,
      })
    )
  }
}

function drawSelectedPlan(
  plan: TransitPlan,
  event: TransitEvent,
  isSelected: boolean,
  isDimmed: boolean,
  polylines: AMap.Polyline[],
  transferMarkers: AMap.Marker[],
  bindSelection: (polyline: AMap.Polyline, event: TransitEvent) => void
) {
  plan.segments.forEach((segment, index) => {
    if (segment.positions.length < 2) return
    const schematic = segment.geometryKind === "SCHEMATIC"
    const style = getRouteSegmentStyle(segment.mode)
    const line = new AMap.Polyline({
      path: lngLatPath(segment.positions),
      strokeColor: periplusColors.routeBlue,
      strokeWeight: isSelected ? 9 : 7,
      strokeOpacity:
        event.detail.planningStatus === "STALE" ? 0.48 : isDimmed ? 0.3 : 0.96,
      strokeStyle:
        schematic || style.strokeStyle === "dashed" ? "dashed" : "solid",
      strokeDasharray: schematic ? [10, 8] : style.dasharray,
      showDir: !schematic,
      zIndex: isSelected ? 120 : 95,
    })
    bindSelection(line, event)
    polylines.push(line)
    for (const traffic of segment.trafficSections ?? []) {
      if (traffic.positions.length < 2 || isDimmed) continue
      const trafficLine = new AMap.Polyline({
        path: lngLatPath(traffic.positions),
        strokeColor: trafficSectionColors[traffic.status],
        strokeWeight: isSelected ? 9 : 7,
        strokeOpacity: 0.98,
      })
      bindSelection(trafficLine, event)
      polylines.push(trafficLine)
    }
    if (index > 0) {
      const [lng, lat] = segment.positions[0]!
      transferMarkers.push(
        new AMap.Marker({
          position: new AMap.LngLat(lng, lat),
          content:
            '<span aria-hidden="true" style="display:block;width:10px;height:10px;border:3px solid #fff;background:#2c2416;border-radius:50%"></span>',
          offset: new AMap.Pixel(-5, -5),
        })
      )
    }
  })
}
