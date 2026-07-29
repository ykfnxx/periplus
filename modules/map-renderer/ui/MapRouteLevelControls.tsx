"use client"

import { ArrowLeft } from "lucide-react"
import { getActivePathView } from "@/lib/routes/active-path"
import {
  totalDurationDays,
  totalDurationMinutes,
} from "@/lib/routes/itinerary-summary"
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

  if (!draftRoute) return null

  const showOverview = () => {
    returnToOverview()
    requestMapFocus({ type: "active-route", maxZoom: 12 })
  }

  const mobileTitle =
    view.level === "overview" ? draftRoute.name : `${view.title} · 城市行程`
  const mobileSummary =
    view.level === "overview"
      ? `${draftRoute.nodes.length} 个城市${
          totalDurationDays(draftRoute.nodes)
            ? ` · ${totalDurationDays(draftRoute.nodes)} 天`
            : ""
        }`
      : `${view.nodes.length} 个地点${
          totalDurationMinutes(view.nodes)
            ? ` · ${formatHours(totalDurationMinutes(view.nodes))}`
            : ""
        }`

  return (
    <>
      <div className="pointer-events-auto absolute top-5 left-4 z-20 flex min-w-[190px] items-center rounded-full border border-ink-10 bg-soft-white/95 px-4 py-2 shadow-periplus-soft backdrop-blur-sm md:hidden">
        {view.level === "city" ? (
          <button
            type="button"
            onClick={showOverview}
            aria-label="返回行程总览"
            className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-soft-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <span className="min-w-0">
          <span className="block truncate text-[10px] font-black text-teak">
            {mobileTitle}
          </span>
          <span className="mt-0.5 block truncate text-[11px] font-black text-ink">
            {mobileSummary}
          </span>
        </span>
      </div>
      {view.level === "city" ? (
        <div
          className="pointer-events-none absolute top-5 z-20 hidden md:block"
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
      ) : null}
    </>
  )
}

function formatHours(minutes: number) {
  const hours = minutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`
}
