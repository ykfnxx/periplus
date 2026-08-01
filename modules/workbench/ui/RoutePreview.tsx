"use client"

import { useEffect, useRef } from "react"
import { ChevronLeft } from "lucide-react"
import { getJourneyScopeProjection } from "@/lib/journeys/projections"
import { totalDurationDays } from "@/lib/journeys/summary"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { selectWorkspaceGraph } from "@/modules/workspace/state/selectors"
import type { TargetWorkspaceDocument } from "@/modules/data-model/contracts"
import RouteOverview from "./RouteOverview"
import RouteScopeTabs from "./RouteScopeTabs"
import RouteTimeline from "./RouteTimeline"

export default function RoutePreview({
  onCollapse,
}: {
  onCollapse?: () => void
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const graph = useWorkspaceStore(selectWorkspaceGraph)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeSectionEventId = useWorkspaceStore(
    (state) => state.activeSectionEventId
  )
  const workspaceCommitState = useWorkspaceStore(
    (state) => state.workspaceCommitState
  )
  const workspaceDraftState = useWorkspaceStore(
    (state) => state.workspaceDocument?.draftState ?? "CLEAN"
  )
  const view = getJourneyScopeProjection(graph, viewLevel, activeSectionEventId)

  useEffect(() => {
    const scrollContainer = rootRef.current?.closest(".periplus-chat-scroll")
    if (scrollContainer) scrollContainer.scrollTop = 0
  }, [activeSectionEventId, viewLevel])

  if (!graph) {
    return (
      <div className="flex h-full min-h-72 items-center justify-center px-6 text-center text-sm leading-6 text-teak">
        暂无路线预览
      </div>
    )
  }

  const durationDays = totalDurationDays(view.events)
  const activeSection =
    view.level === "section"
      ? graph.events.find(
          (event) =>
            event.id === activeSectionEventId && event.type === "SECTION"
        )
      : null
  const scopeLabel =
    activeSection?.type === "SECTION" && activeSection.detail.kind === "DAY"
      ? "每日行程"
      : activeSection?.type === "SECTION" &&
          activeSection.detail.kind === "THEME"
        ? "主题行程"
        : "城市行程"
  const title =
    view.level === "overview"
      ? `${graph.title}${durationDays ? ` · ${durationDays} 天` : ""}`
      : `${view.title}${durationDays ? ` · ${durationDays} 天` : ""}`

  return (
    <div ref={rootRef} className="min-h-full">
      <header className="sticky top-0 z-10 bg-soft-white/98 px-5 pt-4 pb-3 backdrop-blur-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-black text-teak">
              {view.level === "overview" ? "行程总览" : scopeLabel}
            </p>
            <h1
              aria-label={view.level === "overview" ? graph.title : view.title}
              className="mt-1 truncate text-[22px] leading-7 font-black text-ink"
            >
              {title}
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <SaveState
              state={workspaceCommitState}
              draftState={workspaceDraftState}
            />
            {onCollapse ? (
              <button
                type="button"
                onClick={onCollapse}
                aria-label="收起行程面板"
                className="flex h-7 w-[26px] items-center justify-center rounded-lg border border-ink-10 bg-cream text-walnut transition hover:border-russet hover:bg-russet hover:text-soft-white"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-3 h-px bg-ink-10" />
        <RouteScopeTabs />
      </header>

      {view.events.length === 0 && view.level === "overview" ? (
        <div className="m-5 rounded-xl border border-dashed border-ink-20 bg-white/45 p-4 text-sm leading-6 text-walnut">
          路线尚无地点，可以在 AI 面板中添加第一站。
        </div>
      ) : view.level === "overview" ? (
        <RouteOverview />
      ) : view.isEmptySection ? (
        <div className="m-5 rounded-xl border border-dashed border-ink-20 bg-white/45 p-4 text-sm leading-6 text-walnut">
          这个城市还没有安排地点，可以在 AI 面板中继续规划。
        </div>
      ) : (
        <RouteTimeline items={view.items} />
      )}
    </div>
  )
}

function SaveState({
  state,
  draftState,
}: {
  state: ReturnType<typeof useWorkspaceStore.getState>["workspaceCommitState"]
  draftState: TargetWorkspaceDocument["draftState"]
}) {
  const displayState =
    state === "saving"
      ? "saving"
      : state === "error"
        ? "failed"
        : draftState === "CONFLICT"
          ? "conflict"
          : draftState === "STALE"
            ? "stale"
            : draftState === "DIRTY"
              ? "dirty"
              : "saved"
  const label =
    displayState === "saving"
      ? "保存中"
      : displayState === "failed"
        ? "保存失败"
        : displayState === "conflict"
          ? "保存冲突"
          : displayState === "stale"
            ? "需要刷新"
            : displayState === "dirty"
              ? "未保存"
              : "已保存"
  const colors =
    displayState === "failed" || displayState === "conflict"
      ? { dot: "bg-coral", text: "text-coral" }
      : displayState === "saving" ||
          displayState === "dirty" ||
          displayState === "stale"
        ? { dot: "bg-mustard", text: "text-teak" }
        : { dot: "bg-olive", text: "text-olive" }

  return (
    <span
      className={`mt-1.5 flex items-center gap-2 text-[10px] font-black ${colors.text}`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${colors.dot}`} />
      {label}
    </span>
  )
}
