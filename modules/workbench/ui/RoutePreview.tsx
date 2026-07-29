"use client"

import { useEffect, useRef } from "react"
import { Check, Cloud, CloudAlert } from "lucide-react"
import { getActivePathView } from "@/lib/routes/active-path"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import RouteOverview from "./RouteOverview"
import RouteScopeTabs from "./RouteScopeTabs"
import RouteTimeline from "./RouteTimeline"

export default function RoutePreview() {
  const rootRef = useRef<HTMLDivElement>(null)
  const draftRoute = useWorkspaceStore((state) => state.draftRoute)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeRouteNodeId = useWorkspaceStore(
    (state) => state.activeRouteNodeId
  )
  const draftSaveState = useWorkspaceStore((state) => state.draftSaveState)
  const view = getActivePathView(draftRoute, viewLevel, activeRouteNodeId)

  useEffect(() => {
    const scrollContainer = rootRef.current?.closest(
      ".periplus-chat-scroll"
    )
    if (scrollContainer) scrollContainer.scrollTop = 0
  }, [activeRouteNodeId, viewLevel])

  if (!draftRoute) {
    return (
      <div className="flex h-full min-h-72 items-center justify-center px-6 text-center text-sm leading-6 text-teak">
        暂无路线预览
      </div>
    )
  }

  return (
    <div ref={rootRef} className="min-h-full">
      <header className="sticky top-0 z-10 bg-soft-white/96 pt-4 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3 px-4 pb-2.5">
          <div className="min-w-0">
            <h1 className="truncate text-base font-black text-ink">
              {draftRoute.name}
            </h1>
            <p className="mt-0.5 truncate text-[11px] font-bold text-teak">
              {view.level === "overview" ? "路线总览" : view.title}
            </p>
          </div>
          <SaveState state={draftSaveState} />
        </div>
        <RouteScopeTabs />
      </header>

      {draftRoute.nodes.length === 0 ? (
        <div className="m-4 rounded-xl border border-dashed border-ink-20 bg-white/45 p-4 text-sm leading-6 text-walnut">
          路线尚无地点，可以在 AI 面板中添加第一站。
        </div>
      ) : view.level === "overview" ? (
        <RouteOverview />
      ) : view.isEmptyCity ? (
        <div className="m-4 rounded-xl border border-dashed border-ink-20 bg-white/45 p-4 text-sm leading-6 text-walnut">
          这个城市还没有安排地点，可以在 AI 面板中继续规划。
        </div>
      ) : (
        <RouteTimeline nodes={view.nodes} edges={view.edges} />
      )}
    </div>
  )
}

function SaveState({
  state,
}: {
  state: ReturnType<typeof useWorkspaceStore.getState>["draftSaveState"]
}) {
  if (state === "saving") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-teak">
        <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
        保存中
      </span>
    )
  }
  if (state === "error") {
    return (
      <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-coral">
        <CloudAlert className="h-3.5 w-3.5" aria-hidden="true" />
        保存失败
      </span>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold text-olive">
      <Check className="h-3.5 w-3.5" aria-hidden="true" />
      已保存
    </span>
  )
}
