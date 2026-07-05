"use client"

import { useEffect } from "react"
import { ArrowLeft } from "lucide-react"
import { getActivePathView } from "@/lib/routes/active-path"
import { useMapStore } from "@/stores/mapStore"

export default function MapRouteLevelControls() {
  const map = useMapStore((state) => state.map)
  const currentRoute = useMapStore((state) => state.currentRoute)
  const viewLevel = useMapStore((state) => state.viewLevel)
  const activeRouteNodeId = useMapStore((state) => state.activeRouteNodeId)
  const returnToOverview = useMapStore((state) => state.returnToOverview)
  const view = getActivePathView(currentRoute, viewLevel, activeRouteNodeId)

  useEffect(() => {
    if (!map) return

    const handleZoomChange = () => {
      if (useMapStore.getState().viewLevel === "city" && map.getZoom() < 12) {
        returnToOverview()
      }
    }

    map.on("zoomchange", handleZoomChange)
    return () => {
      map.off("zoomchange", handleZoomChange)
    }
  }, [map, returnToOverview])

  if (view.level !== "city") return null

  return (
    <div className="pointer-events-none absolute top-5 left-[min(460px,calc(100vw-112px))] z-20">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)]/95 px-2 py-2 shadow-[var(--periplus-soft-shadow)] backdrop-blur-sm">
        <button
          type="button"
          onClick={returnToOverview}
          className="flex h-8 items-center gap-1.5 rounded-full bg-[var(--periplus-ink)] px-3 text-xs font-bold text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-russet)]"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          概览
        </button>
        <span className="max-w-[180px] truncate pr-2 text-xs font-bold text-[var(--periplus-walnut)]">
          {view.title}
        </span>
      </div>
    </div>
  )
}
