"use client"

import { Pencil } from "lucide-react"
import { routeMarkerColors } from "@/lib/ui/map-theme"
import type { Route, RoutePoint } from "@/types/route"
import RoutePointEditor from "./RoutePointEditor"

interface RouteTimelineProps {
  route: Route
  editingPointId: string | null
  onEditPoint: (pointId: string | null) => void
  onChangePoint: (point: RoutePoint) => void
}

export default function RouteTimeline({
  route,
  editingPointId,
  onEditPoint,
  onChangePoint,
}: RouteTimelineProps) {
  const points = [...route.points].sort((a, b) => a.order - b.order)

  if (!points.length) {
    return (
      <p className="rounded-lg border border-dashed border-[rgb(44_36_22_/_18%)] bg-white/50 p-4 text-sm text-[var(--periplus-walnut)]">
        暂无匹配地点
      </p>
    )
  }

  return (
    <ol className="space-y-3">
      {points.map((point, index) => {
        const markerColor = routeMarkerColors[index % routeMarkerColors.length]
        const isEditing = editingPointId === point.id

        return (
          <li key={point.id} className="grid grid-cols-[34px_1fr] gap-3">
            <div className="flex flex-col items-center">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white text-xs font-black text-white shadow-[0_8px_18px_rgb(44_36_22_/_18%)]"
                style={{ backgroundColor: markerColor }}
              >
                {point.order + 1}
              </span>
              {index < points.length - 1 && (
                <span className="mt-2 h-full min-h-8 w-px bg-[rgb(44_36_22_/_14%)]" />
              )}
            </div>
            <div className="min-w-0 space-y-2">
              <div className="rounded-lg border border-[rgb(44_36_22_/_14%)] bg-white/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-black text-[var(--periplus-ink)]">
                      {point.name}
                    </h3>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px] font-bold text-[var(--periplus-teak)]">
                      <span>
                        {point.lat.toFixed(4)}, {point.lng.toFixed(4)}
                      </span>
                      {point.stayHours !== undefined && (
                        <span>停留 {point.stayHours} 小时</span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEditPoint(point.id)}
                    className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-cream)] px-3 text-xs font-black text-[var(--periplus-walnut)] transition hover:border-[var(--periplus-russet)]"
                    aria-label={`编辑 ${point.name}`}
                  >
                    <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                    编辑
                  </button>
                </div>
                {point.notes && (
                  <p className="mt-2 text-xs leading-5 text-[var(--periplus-walnut)]">
                    {point.notes}
                  </p>
                )}
              </div>
              {isEditing && (
                <RoutePointEditor
                  point={point}
                  onSubmit={onChangePoint}
                  onCancel={() => onEditPoint(null)}
                />
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
