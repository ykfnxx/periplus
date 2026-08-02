"use client"

import { formatTransitDistance } from "@/lib/journeys/display"
import {
  getJourneyScopeProjection,
  getJourneyScopeTreeEvents,
} from "@/lib/journeys/projections"
import {
  locationCount,
  totalDurationDays,
  totalTransitDistanceMeters,
} from "@/lib/journeys/summary"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { selectWorkspaceGraph } from "@/modules/workspace/state/selectors"

export default function AIContextCard() {
  const graph = useWorkspaceStore(selectWorkspaceGraph)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeSectionEventId = useWorkspaceStore(
    (state) => state.activeSectionEventId
  )
  const selectedLocationEvent = useWorkspaceStore(
    (state) => state.selectedLocationEvent
  )
  const view = getJourneyScopeProjection(graph, viewLevel, activeSectionEventId)

  if (!graph) return null

  const contextEvents = getJourneyScopeTreeEvents(
    graph,
    viewLevel,
    activeSectionEventId
  )
  const days = totalDurationDays(contextEvents)
  const distance = totalTransitDistanceMeters(
    contextEvents,
    graph.transitPlanningRuns
  )
  const details = selectedLocationEvent
    ? `当前选中：${selectedLocationEvent.title}`
    : [
        `${locationCount(contextEvents)} 个地点`,
        days ? `${days} 天` : null,
        distance ? formatTransitDistance(distance) : null,
      ]
        .filter(Boolean)
        .join(" · ")

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
            ? `${graph.title} · 全程总览`
            : `${view.title} · 分段详情`}
        </p>
      </div>
      <p className="mt-1 pl-[26px] text-[10px] font-bold text-teak">
        {details || "尚无可执行事件"}
      </p>
    </div>
  )
}
