"use client"

import { useEffect } from "react"
import type { Map } from "maplibre-gl"
import type { JourneyEvent } from "@/modules/data-model/contracts/index"
import {
  segmentMapPath,
  standaloneTransitPath,
} from "@/lib/journeys/route-paths"
import {
  getRouteSegmentStyle,
  periplusColors,
  trafficSectionColors,
} from "@/lib/ui/map-theme"

export default function useJourneyRoutes(
  map: Map | null,
  events: readonly JourneyEvent[],
  selectedEventId: string | null | undefined,
  onSelect?: (eventId: string) => void
) {
  useEffect(() => {
    if (!map) return
    const cleanups: (() => void)[] = []
    // Draw the selected event last so its route stays above other routes.
    const ordered = [...events].sort(
      (a, b) =>
        Number(a.id === selectedEventId) - Number(b.id === selectedEventId)
    )
    for (const event of ordered) {
      const selected = event.id === selectedEventId
      if (event.transit?.routeState !== "READY") {
        const path = standaloneTransitPath(event)
        if (path.length < 2) continue
        const sourceId = `journey-route-${event.id}-standalone`
        const width = selected ? 7 : 5
        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: path },
          },
        })
        map.addLayer({
          id: sourceId,
          source: sourceId,
          type: "line",
          paint: {
            "line-color": selected
              ? periplusColors.journalTransitAccent
              : periplusColors.mapRoute,
            "line-width": width,
            "line-opacity": selectedEventId && !selected ? 0.45 : 0.94,
            "line-dasharray": [10 / width, 8 / width],
          },
        })
        const select = () => onSelect?.(event.id)
        map.on("click", sourceId, select)
        cleanups.push(() => {
          map.off("click", sourceId, select)
          if (map.getLayer(sourceId)) map.removeLayer(sourceId)
          if (map.getSource(sourceId)) map.removeSource(sourceId)
        })
        continue
      }
      const plan = event.transit.route?.plans[0]
      if (!plan) continue
      plan.segments.forEach((segment, index) => {
        const path = segmentMapPath(segment)
        if (path.length < 2) return
        const sourceId = `journey-route-${event.id}-${index}`
        const style = getRouteSegmentStyle(segment.mode)
        const width = selected ? 9 : 7
        const dash =
          segment.geometryKind === "SCHEMATIC" ? [10, 8] : style.dasharray
        map.addSource(sourceId, {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: path },
          },
        })
        const layers = [sourceId]
        map.addLayer({
          id: sourceId,
          source: sourceId,
          type: "line",
          paint: {
            "line-color": periplusColors.mapRoute,
            "line-width": width,
            "line-opacity": selectedEventId && !selected ? 0.4 : 0.96,
            ...(dash
              ? { "line-dasharray": dash.map((value) => value / width) }
              : {}),
          },
        })
        const trafficSources: string[] = []
        for (const [trafficIndex, traffic] of (
          segment.trafficSections ?? []
        ).entries()) {
          const positions = segmentMapPath(segment, traffic.positions)
          if (positions.length < 2) continue
          const id = `${sourceId}-traffic-${trafficIndex}`
          trafficSources.push(id)
          layers.push(id)
          map.addSource(id, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: { type: "LineString", coordinates: positions },
            },
          })
          map.addLayer({
            id,
            source: id,
            type: "line",
            paint: {
              "line-color": trafficSectionColors[traffic.status],
              "line-width": width,
            },
          })
        }
        if (segment.geometryKind !== "SCHEMATIC") {
          const arrows = `${sourceId}-direction`
          layers.push(arrows)
          map.addLayer({
            id: arrows,
            source: sourceId,
            type: "symbol",
            layout: {
              "symbol-placement": "line",
              "symbol-spacing": 80,
              "text-field": "›",
              "text-font": ["Noto Sans Regular"],
              "text-size": 20,
              "text-keep-upright": false,
              "text-allow-overlap": true,
            },
            paint: { "text-color": periplusColors.white },
          })
        }
        const select = () => onSelect?.(event.id)
        for (const layer of layers) map.on("click", layer, select)
        cleanups.push(() => {
          for (const layer of layers.reverse()) {
            map.off("click", layer, select)
            if (map.getLayer(layer)) map.removeLayer(layer)
          }
          for (const id of [...trafficSources, sourceId]) {
            if (map.getSource(id)) map.removeSource(id)
          }
        })
      })
    }
    return () => {
      cleanups.forEach((cleanup) => cleanup())
    }
  }, [map, events, selectedEventId, onSelect])
}
