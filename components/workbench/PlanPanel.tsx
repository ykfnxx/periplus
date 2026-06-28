"use client"

import { useMemo, useState } from "react"
import { MapPin, Save } from "lucide-react"
import { createRoute, updateRoute } from "@/lib/routes/client"
import { useMapStore } from "@/stores/mapStore"
import type { Route, RoutePoint } from "@/types/route"
import RouteTimeline from "./RouteTimeline"

interface PlanPanelProps {
  searchQuery: string
}

type SaveStatus = "idle" | "saving" | "success" | "error"

function matchesPoint(point: RoutePoint, query: string) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  return [point.name, point.notes ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(normalized)
}

function getRouteInput(route: Route) {
  return {
    name: route.name,
    description: route.description,
    points: route.points,
  }
}

function isNewRoute(route: Route) {
  return route.id.startsWith("preset-") || route.id.startsWith("temp-")
}

export default function PlanPanel({ searchQuery }: PlanPanelProps) {
  const currentRoute = useMapStore((state) => state.currentRoute)
  const setCurrentRoute = useMapStore((state) => state.setCurrentRoute)
  const editingPointId = useMapStore((state) => state.editingPointId)
  const setEditingPointId = useMapStore((state) => state.setEditingPointId)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle")

  const visibleRoute = useMemo(() => {
    if (!currentRoute) return null

    return {
      ...currentRoute,
      points: currentRoute.points.filter((point) =>
        matchesPoint(point, searchQuery)
      ),
    }
  }, [currentRoute, searchQuery])

  const changePoint = (point: RoutePoint) => {
    if (!currentRoute) return

    setCurrentRoute({
      ...currentRoute,
      points: currentRoute.points.map((routePoint) =>
        routePoint.id === point.id ? point : routePoint
      ),
    })
    setEditingPointId(null)
    setSaveStatus("idle")
  }

  const saveRoute = async () => {
    if (!currentRoute) return

    setSaveStatus("saving")
    try {
      const savedRoute = isNewRoute(currentRoute)
        ? await createRoute(getRouteInput(currentRoute))
        : await updateRoute(currentRoute.id, getRouteInput(currentRoute))

      setCurrentRoute(savedRoute)
      setEditingPointId(null)
      setSaveStatus("success")
    } catch {
      setSaveStatus("error")
    }
  }

  if (!currentRoute || !visibleRoute) {
    return (
      <div className="space-y-3">
        <div>
          <h2 className="text-2xl leading-tight font-black text-[var(--periplus-ink)]">
            开始计划
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--periplus-walnut)]">
            从探索或收藏中选择一条路线，随后在这里调整地点与停留时间。
          </p>
        </div>
      </div>
    )
  }

  const totalStayHours = currentRoute.points.reduce(
    (total, point) => total + (point.stayHours ?? 0),
    0
  )

  return (
    <div className="flex min-h-full flex-col gap-4">
      <div className="space-y-3">
        <div>
          <h2 className="text-2xl leading-tight font-black text-[var(--periplus-ink)]">
            {currentRoute.name}
          </h2>
          {currentRoute.description && (
            <p className="mt-1 text-sm leading-6 text-[var(--periplus-walnut)]">
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
              匹配
            </p>
            <p className="mt-1 text-lg font-black text-[var(--periplus-ink)]">
              {visibleRoute.points.length}
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto pr-1">
        <RouteTimeline
          route={visibleRoute}
          editingPointId={editingPointId}
          onEditPoint={setEditingPointId}
          onChangePoint={changePoint}
        />
      </div>

      <div className="space-y-2 border-t border-[rgb(44_36_22_/_12%)] pt-3">
        {saveStatus === "success" && (
          <p className="text-xs font-bold text-[var(--periplus-olive)]">
            保存成功
          </p>
        )}
        {saveStatus === "error" && (
          <p className="text-xs font-bold text-[var(--periplus-coral)]">
            保存失败，请稍后重试
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled
            className="flex h-10 items-center justify-center gap-2 rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)] text-xs font-black text-[var(--periplus-walnut)] opacity-55"
          >
            <MapPin aria-hidden="true" className="h-4 w-4" />
            地图选点
          </button>
          <button
            type="button"
            onClick={saveRoute}
            disabled={saveStatus === "saving"}
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
