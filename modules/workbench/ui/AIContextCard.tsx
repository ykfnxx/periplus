"use client"

import { getActivePathView } from "@/lib/routes/active-path"
import {
  totalDistanceMeters,
  totalDurationDays,
} from "@/lib/routes/itinerary-summary"
import { formatRouteDistance } from "@/lib/routes/route-display"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function AIContextCard() {
  const draftRoute = useWorkspaceStore((state) => state.draftRoute)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeRouteNodeId = useWorkspaceStore(
    (state) => state.activeRouteNodeId
  )
  const selectedLocationPoint = useWorkspaceStore(
    (state) => state.selectedLocationPoint
  )
  const view = getActivePathView(draftRoute, viewLevel, activeRouteNodeId)

  if (!draftRoute) return null

  const days = totalDurationDays(
    view.level === "overview" ? draftRoute.nodes : view.nodes
  )
  const details =
    view.level === "overview"
      ? [
          `${draftRoute.nodes.length} 个城市`,
          days ? `${days} 天` : null,
          totalDistanceMeters(draftRoute.edges)
            ? formatRouteDistance(totalDistanceMeters(draftRoute.edges))
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : selectedLocationPoint
        ? `当前选中：${selectedLocationPoint.name}`
        : `${view.nodes.length} 个地点 · 当前城市范围`

  return (
    <div className="mx-5 rounded-[10px] bg-cream px-3.5 py-3">
      <div className="flex items-center gap-2.5">
        <span
          className={`h-4 w-4 shrink-0 rounded-full ${
            view.level === "overview" ? "bg-russet" : "bg-route-blue"
          }`}
        />
        <p className="min-w-0 truncate text-[13px] font-black text-ink">
          {view.level === "overview"
            ? `${draftRoute.name} · 全程总览`
            : `${view.title} · 城市详情`}
        </p>
      </div>
      <p className="mt-1 pl-[26px] text-[10px] font-bold text-teak">
        {details}
      </p>
    </div>
  )
}
