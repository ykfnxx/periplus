"use client"

import { ArrowLeft } from "lucide-react"
import { getActivePathView } from "@/lib/routes/active-path"
import { useWorkspaceViewportInsets } from "@/modules/workspace/state/selectors"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function MapRouteLevelControls() {
  const draftRoute = useWorkspaceStore((state) => state.draftRoute)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeRouteNodeId = useWorkspaceStore(
    (state) => state.activeRouteNodeId
  )
  const returnToOverview = useWorkspaceStore((state) => state.returnToOverview)
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)
  const viewportInsets = useWorkspaceViewportInsets()
  const view = getActivePathView(draftRoute, viewLevel, activeRouteNodeId)

  if (view.level !== "city") return null

  const showOverview = () => {
    returnToOverview()
    requestMapFocus({ type: "active-route", maxZoom: 12 })
  }

  return (
    <div
      className="pointer-events-none absolute top-5 z-20"
      style={{
        left: `min(${viewportInsets.left}px, calc(100vw - 112px))`,
      }}
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-ink-15 bg-soft-white/95 px-2 py-2 shadow-periplus-soft backdrop-blur-sm">
        <button
          type="button"
          onClick={showOverview}
          className="flex h-8 items-center gap-1.5 rounded-full bg-ink px-3 text-xs font-bold text-soft-white transition hover:bg-russet"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          概览
        </button>
        <span className="max-w-[180px] truncate pr-2 text-xs font-bold text-walnut">
          {view.title}
        </span>
      </div>
    </div>
  )
}
