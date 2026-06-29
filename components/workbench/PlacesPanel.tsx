"use client"

import { useState, type FormEvent } from "react"
import { MapPin, Plus } from "lucide-react"
import { silkRoadRoute } from "@/lib/mock-routes"
import { useMapStore } from "@/stores/mapStore"
import RouteListItem from "./RouteListItem"

export default function PlacesPanel() {
  const currentRoute = useMapStore((state) => state.currentRoute)
  const setCurrentRoute = useMapStore((state) => state.setCurrentRoute)
  const setActiveWorkbenchTool = useMapStore(
    (state) => state.setActiveWorkbenchTool
  )
  const startPointLocationSelection = useMapStore(
    (state) => state.startPointLocationSelection
  )
  const pointSelectionDraft = useMapStore((state) => state.pointSelectionDraft)
  const setPointSelectionDraft = useMapStore(
    (state) => state.setPointSelectionDraft
  )
  const setAddPointMode = useMapStore((state) => state.setAddPointMode)
  const [newPointName, setNewPointName] = useState("新地点")
  const [newPointStayHours, setNewPointStayHours] = useState("1")
  const [newPointNotes, setNewPointNotes] = useState("")
  const [addPointError, setAddPointError] = useState("")

  const resetDraftPointForm = () => {
    setNewPointName("新地点")
    setNewPointStayHours("1")
    setNewPointNotes("")
    setAddPointError("")
  }

  const closeDraftPointForm = () => {
    setPointSelectionDraft(null)
    setAddPointMode("closed")
    resetDraftPointForm()
  }

  const restartPointLocationSelection = () => {
    resetDraftPointForm()
    startPointLocationSelection()
  }

  const addDraftPoint = (event: FormEvent) => {
    event.preventDefault()
    if (!currentRoute || !pointSelectionDraft) return

    const trimmedName = newPointName.trim()
    if (!trimmedName) {
      setAddPointError("请输入地点名称")
      return
    }

    const stayHours = Number(newPointStayHours)
    if (!Number.isFinite(stayHours) || stayHours <= 0) {
      setAddPointError("停留时间必须大于 0")
      return
    }

    setCurrentRoute({
      ...currentRoute,
      points: [
        ...currentRoute.points,
        {
          id: `temp-${Date.now()}`,
          name: trimmedName,
          lat: pointSelectionDraft.lat,
          lng: pointSelectionDraft.lng,
          order: currentRoute.points.length,
          stayHours,
          notes: newPointNotes.trim(),
        },
      ],
    })
    closeDraftPointForm()
  }

  const selectStarterRoute = () => {
    setCurrentRoute(silkRoadRoute)
    setActiveWorkbenchTool("plan")
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[11px] font-black tracking-[0.16em] text-[var(--periplus-teak)] uppercase">
          PLACES
        </p>
        <h2 className="mt-1 text-2xl leading-tight font-black text-[var(--periplus-ink)]">
          地点工作区
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--periplus-walnut)]">
          用地图选点补充行程，也可以从现有地点快速开始。
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={restartPointLocationSelection}
          className="flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--periplus-russet)] px-4 text-xs font-black text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-ink)]"
        >
          <MapPin aria-hidden="true" className="h-4 w-4" />
          地图选点
        </button>
        <button
          type="button"
          onClick={() => setActiveWorkbenchTool("plan")}
          className="flex h-10 items-center justify-center gap-2 rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)] px-4 text-xs font-black text-[var(--periplus-walnut)] transition hover:border-[var(--periplus-russet)]"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          看规划
        </button>
      </div>

      {pointSelectionDraft && (
        <form
          onSubmit={addDraftPoint}
          noValidate
          className="space-y-2 rounded-lg border border-[rgb(44_36_22_/_14%)] bg-white/70 p-3"
        >
          <div>
            <p className="text-xs font-black text-[var(--periplus-ink)]">
              添加地图选点
            </p>
            <p className="mt-1 text-[11px] font-bold text-[var(--periplus-teak)]">
              {pointSelectionDraft.lat.toFixed(4)},{" "}
              {pointSelectionDraft.lng.toFixed(4)}
            </p>
          </div>
          <input
            value={newPointName}
            onChange={(event) => setNewPointName(event.target.value)}
            className="w-full rounded-md border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)] px-3 py-2 text-sm text-[var(--periplus-ink)] outline-none focus:border-[var(--periplus-russet)]"
            aria-label="地点名称"
          />
          <input
            type="number"
            min="0.25"
            step="0.25"
            value={newPointStayHours}
            onChange={(event) => setNewPointStayHours(event.target.value)}
            className="w-full rounded-md border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)] px-3 py-2 text-sm text-[var(--periplus-ink)] outline-none focus:border-[var(--periplus-russet)]"
            aria-label="停留小时"
          />
          <textarea
            value={newPointNotes}
            onChange={(event) => setNewPointNotes(event.target.value)}
            className="h-16 w-full resize-none rounded-md border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)] px-3 py-2 text-sm text-[var(--periplus-ink)] outline-none focus:border-[var(--periplus-russet)]"
            aria-label="地点备注"
          />
          {addPointError && (
            <p className="text-xs font-bold text-[var(--periplus-coral)]">
              {addPointError}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={closeDraftPointForm}
              className="h-9 rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)] text-xs font-black text-[var(--periplus-walnut)]"
            >
              取消
            </button>
            <button
              type="submit"
              className="h-9 rounded-full bg-[var(--periplus-russet)] text-xs font-black text-[var(--periplus-soft-white)]"
            >
              添加到路线
            </button>
          </div>
        </form>
      )}

      {currentRoute ? (
        <div className="space-y-2">
          <h3 className="text-xs font-black text-[var(--periplus-ink)]">
            当前路线地点
          </h3>
          {currentRoute.points.map((point, index) => (
            <div
              key={point.id}
              className="flex items-start gap-3 rounded-lg border border-[rgb(44_36_22_/_14%)] bg-white/60 p-3"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--periplus-mustard)] text-[11px] font-black text-[var(--periplus-ink)]">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-[var(--periplus-ink)]">
                  {point.name}
                </p>
                {point.notes && (
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--periplus-walnut)]">
                    {point.notes}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-xs font-black text-[var(--periplus-ink)]">
            可用路线
          </h3>
          <RouteListItem route={silkRoadRoute} onSelect={selectStarterRoute} />
        </div>
      )}
    </div>
  )
}
