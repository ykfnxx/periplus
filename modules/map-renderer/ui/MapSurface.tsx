"use client"

import { useEffect, useRef } from "react"
import { loadAMap } from "@/lib/amap"
import type { MapIntent } from "@/modules/workspace/contracts"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import RoutePolyline from "./RoutePolyline"
import RouteMarkers from "./RouteMarkers"
import PhotoMarkers from "./PhotoMarkers"
import LocationSelector from "./LocationSelector"
import LocationInfoBubble from "./LocationInfoBubble"
import MapRouteLevelControls from "./MapRouteLevelControls"
import MapViewportController from "./MapViewportController"
import OverlapCluster from "./OverlapCluster"
import EdgeBadgeLayer from "./EdgeBadgeLayer"

interface MapSurfaceProps {
  onIntent?: (intent: MapIntent) => void
}

export default function MapSurface({ onIntent }: MapSurfaceProps) {
  const mapDivRef = useRef<HTMLDivElement>(null)
  const setMap = useWorkspaceStore((s) => s.setMap)
  const mapError = useWorkspaceStore((s) => s.mapError)
  const setMapError = useWorkspaceStore((s) => s.setMapError)
  const isPickingUploadPhotoLocation = useWorkspaceStore(
    (s) => s.isSelectingLocation && s.locationSelectionMode === "upload-photo"
  )

  useEffect(() => {
    let mapInstance: AMap.Map | null = null
    let mounted = true

    loadAMap()
      .then((AMap) => {
        if (!mounted || !mapDivRef.current) return
        setMapError(null)

        mapInstance = new AMap.Map(mapDivRef.current, {
          zoom: 5,
          center: [104.5, 36.5],
          viewMode: "2D",
          mapStyle: "amap://styles/5fa99faa24edae66ca845a370693c754",
        })

        mapInstance.addControl(new AMap.Scale())
        mapInstance.on("click", (event) => {
          if (useWorkspaceStore.getState().isSelectingLocation) {
            onIntent?.({
              type: "map.location-picked",
              coordinate: {
                lat: event.lnglat.getLat(),
                lng: event.lnglat.getLng(),
              },
            })
            return
          }
          onIntent?.({ type: "map.background-clicked" })
        })

        if (mounted) {
          setMap(mapInstance)
        }
      })
      .catch((err) => {
        console.error("Failed to load AMap:", err)
        if (mounted) {
          setMapError("地图加载失败，请检查高德 Key 或网络连接")
        }
      })

    return () => {
      mounted = false
      setMap(null)
      if (mapInstance) {
        // 子覆盖层仍需使用地图实例移除 Marker 和 Polyline，延后销毁避免清理顺序竞争。
        const staleMapInstance = mapInstance
        window.setTimeout(() => staleMapInstance.destroy(), 0)
      }
    }
  }, [onIntent, setMap, setMapError])

  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      <div
        ref={mapDivRef}
        className="h-full w-full"
        style={{ minHeight: "100%" }}
      />
      {mapError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--color-cream)]">
          <div className="max-w-sm rounded-lg border border-[rgb(44_36_22_/_14%)] bg-[var(--color-soft-white)] p-4 text-sm text-[var(--color-walnut)] shadow-[var(--shadow-periplus-soft)]">
            {mapError}
          </div>
        </div>
      )}
      <RoutePolyline key="polyline" onIntent={onIntent} />
      <EdgeBadgeLayer key="edge-badges" onIntent={onIntent} />
      <RouteMarkers key="markers" onIntent={onIntent} />
      <LocationInfoBubble key="location-info" />
      <PhotoMarkers key="photo-markers" onIntent={onIntent} />
      <LocationSelector key="location-selector" />
      <OverlapCluster key="overlap-cluster" onIntent={onIntent} />
      <MapViewportController key="map-viewport-controller" />
      {!mapError && !isPickingUploadPhotoLocation && (
        <MapRouteLevelControls key="map-route-level-controls" />
      )}
    </div>
  )
}
