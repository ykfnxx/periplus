"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { loadAMap, PERIPLUS_AMAP_STYLE } from "@/lib/amap"
import MapViewportController from "@/modules/map-renderer/ui/MapViewportController"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function RealMapStoryCanvas({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  const mapDivRef = useRef<HTMLDivElement>(null)
  const mapReady = useWorkspaceStore((state) => state.mapReady)
  const mapError = useWorkspaceStore((state) => state.mapError)
  const setMap = useWorkspaceStore((state) => state.setMap)
  const setMapError = useWorkspaceStore((state) => state.setMapError)

  useEffect(() => {
    let mapInstance: AMap.Map | null = null
    let mounted = true

    loadAMap()
      .then((AMap) => {
        if (!mounted || !mapDivRef.current) return
        setMapError(null)
        mapInstance = new AMap.Map(mapDivRef.current, {
          zoom: 11,
          center: [94.68, 40.09],
          viewMode: "2D",
          animateEnable: false,
          mapStyle: PERIPLUS_AMAP_STYLE,
        })
        mapInstance.addControl(new AMap.Scale())
        setMap(mapInstance)
      })
      .catch((error) => {
        console.error("Failed to load AMap for Storybook:", error)
        if (mounted) setMapError("地图加载失败，请检查高德 Key 或网络连接")
      })

    return () => {
      mounted = false
      setMap(null)
      if (mapInstance) {
        const staleMap = mapInstance
        window.setTimeout(() => staleMap.destroy(), 0)
      }
    }
  }, [setMap, setMapError])

  return (
    <div className="relative h-screen min-h-[600px] w-screen overflow-hidden bg-cream">
      <div ref={mapDivRef} className="h-full w-full" />
      {children}
      <MapViewportController />
      <div className="pointer-events-none absolute top-4 left-4 z-50 max-w-[320px] rounded-xl border border-ink-15 bg-soft-white/96 px-4 py-3 text-ink shadow-periplus-soft backdrop-blur-sm">
        <p className="text-sm font-black">{title}</p>
        <p className="mt-1 text-xs leading-5 text-walnut">{description}</p>
        <p className="mt-2 text-[10px] font-bold text-teak">
          {mapError ?? (mapReady ? "真实地图已加载" : "正在加载真实地图")}
        </p>
      </div>
      {mapError ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-cream/90 p-6">
          <div className="max-w-sm rounded-xl border border-ink-15 bg-soft-white p-4 text-sm text-walnut shadow-periplus-soft">
            {mapError}
          </div>
        </div>
      ) : null}
    </div>
  )
}
