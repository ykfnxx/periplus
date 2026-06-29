"use client"

import { useMemo } from "react"
import { MapPin, Save, Square } from "lucide-react"
import { useMapStore } from "@/stores/mapStore"
import type { Route, RoutePoint } from "@/types/route"
import RouteTimeline from "./RouteTimeline"

export default function PlanPanel() {
  const currentRoute = useMapStore((state) => state.currentRoute)
  const setCurrentRoute = useMapStore((state) => state.setCurrentRoute)
  const isDraftLocked = useMapStore((state) => state.isDraftLocked)
  const draftSaveState = useMapStore((state) => state.draftSaveState)
  const setDraftSaveState = useMapStore((state) => state.setDraftSaveState)
  const agentMessages = useMapStore((state) => state.agentMessages)
  const sendAgentEvent = useMapStore((state) => state.sendAgentEvent)
  const editingPointId = useMapStore((state) => state.editingPointId)
  const setEditingPointId = useMapStore((state) => state.setEditingPointId)
  const startPointLocationSelection = useMapStore(
    (state) => state.startPointLocationSelection
  )
  const setActiveWorkbenchTool = useMapStore(
    (state) => state.setActiveWorkbenchTool
  )
  const totalStayHours = useMemo(() => {
    return (
      currentRoute?.points.reduce(
        (total, point) => total + (point.stayHours ?? 0),
        0
      ) ?? 0
    )
  }, [currentRoute])

  const changePoint = (point: RoutePoint) => {
    if (!currentRoute || isDraftLocked) return

    const nextRoute: Route = {
      ...currentRoute,
      points: currentRoute.points.map((routePoint) =>
        routePoint.id === point.id ? point : routePoint
      ),
    }
    setCurrentRoute(nextRoute)
    sendAgentEvent?.("draft.replace", { route: nextRoute })
    setEditingPointId(null)
    setDraftSaveState("idle")
  }

  const addPlaceFromMap = () => {
    if (isDraftLocked) return
    startPointLocationSelection()
    setActiveWorkbenchTool("places")
  }

  const saveRoute = () => {
    if (!currentRoute || !sendAgentEvent || isDraftLocked) return

    setDraftSaveState("saving")
    sendAgentEvent("draft.save")
    setEditingPointId(null)
  }

  const cancelAgentRun = () => {
    sendAgentEvent?.("agent.run.cancel")
  }

  if (!currentRoute) {
    return (
      <div className="space-y-3">
        <div>
          <p className="text-[11px] font-black tracking-[0.16em] text-[var(--periplus-teak)] uppercase">
            PLAN
          </p>
          <h2 className="mt-1 text-2xl leading-tight font-black text-[var(--periplus-ink)]">
            开始规划
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--periplus-walnut)]">
            从地点或收藏中选择一条路线，随后在这里调整停留时间和顺序。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setActiveWorkbenchTool("places")}
          className="flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--periplus-russet)] px-4 text-xs font-black text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-ink)]"
        >
          <MapPin aria-hidden="true" className="h-4 w-4" />
          选择地点
        </button>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="space-y-3">
        <div>
          <p className="text-[11px] font-black tracking-[0.16em] text-[var(--periplus-teak)] uppercase">
            PLAN
          </p>
          <h2 className="mt-1 text-2xl leading-tight font-black text-[var(--periplus-ink)]">
            {currentRoute.name}
          </h2>
          {currentRoute.description && (
            <p className="mt-2 text-sm leading-6 text-[var(--periplus-walnut)]">
              {currentRoute.description}
            </p>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-[rgb(44_36_22_/_14%)] bg-white/60 p-3">
            <p className="text-[11px] font-black text-[var(--periplus-teak)]">
              地点
            </p>
            <p className="mt-1 text-lg font-black text-[var(--periplus-ink)]">
              {currentRoute.points.length}
            </p>
          </div>
          <div className="rounded-lg border border-[rgb(44_36_22_/_14%)] bg-white/60 p-3">
            <p className="text-[11px] font-black text-[var(--periplus-teak)]">
              停留
            </p>
            <p className="mt-1 text-lg font-black text-[var(--periplus-ink)]">
              {totalStayHours}h
            </p>
          </div>
          <div className="rounded-lg border border-[rgb(44_36_22_/_14%)] bg-white/60 p-3">
            <p className="text-[11px] font-black text-[var(--periplus-teak)]">
              状态
            </p>
            <p className="mt-1 text-lg font-black text-[var(--periplus-ink)]">
              草稿
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        <RouteTimeline
          route={currentRoute}
          editingPointId={editingPointId}
          onEditPoint={setEditingPointId}
          onChangePoint={changePoint}
          isLocked={isDraftLocked}
        />
      </div>

      <div className="space-y-2 border-t border-[rgb(44_36_22_/_12%)] pt-3">
        {(isDraftLocked || agentMessages.length > 0) && (
          <div className="space-y-2 rounded-lg border border-[rgb(44_36_22_/_14%)] bg-white/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] font-black tracking-[0.16em] text-[var(--periplus-teak)] uppercase">
                AGENT
              </p>
              {isDraftLocked && (
                <button
                  type="button"
                  onClick={cancelAgentRun}
                  className="flex h-7 items-center gap-1 rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)] px-2 text-[11px] font-black text-[var(--periplus-walnut)]"
                >
                  <Square aria-hidden="true" className="h-3 w-3" />
                  停止
                </button>
              )}
            </div>
            <pre className="max-h-28 overflow-auto whitespace-pre-wrap text-xs leading-5 text-[var(--periplus-walnut)]">
              {agentMessages.join("") || "Agent 正在规划..."}
            </pre>
          </div>
        )}
        {draftSaveState === "success" && (
          <p className="text-xs font-bold text-[var(--periplus-olive)]">
            保存成功
          </p>
        )}
        {draftSaveState === "error" && (
          <p className="text-xs font-bold text-[var(--periplus-coral)]">
            保存失败，请稍后重试
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={addPlaceFromMap}
            disabled={isDraftLocked}
            className="flex h-10 items-center justify-center gap-2 rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)] text-xs font-black text-[var(--periplus-walnut)] transition hover:border-[var(--periplus-russet)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <MapPin aria-hidden="true" className="h-4 w-4" />
            添加地点
          </button>
          <button
            type="button"
            onClick={saveRoute}
            disabled={
              draftSaveState === "saving" || isDraftLocked || !sendAgentEvent
            }
            className="flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--periplus-russet)] text-xs font-black text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-ink)] disabled:cursor-wait disabled:opacity-70"
          >
            <Save aria-hidden="true" className="h-4 w-4" />
            保存变更
          </button>
        </div>
      </div>
    </div>
  )
}
