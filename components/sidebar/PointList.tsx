"use client"

import { useMapStore } from "@/stores/mapStore"
import type { RoutePoint } from "@/types/route"

interface PointListProps {
  onEdit: (point: RoutePoint) => void
  onDelete: (pointId: string) => void
}

export default function PointList({ onEdit, onDelete }: PointListProps) {
  const currentRoute = useMapStore((s) => s.currentRoute)
  const selectedLocationPoint = useMapStore((s) => s.selectedLocationPoint)
  const setSelectedLocationPoint = useMapStore(
    (s) => s.setSelectedLocationPoint
  )

  if (!currentRoute || currentRoute.points.length === 0) {
    return <p className="text-sm text-slate-400">暂无地点，点击添加</p>
  }

  const sortedPoints = [...currentRoute.points].sort(
    (a, b) => a.order - b.order
  )

  return (
    <ul className="flex-1 space-y-2 overflow-auto">
      {sortedPoints.map((point, index) => (
        <li
          key={point.id}
          className={`cursor-pointer rounded-lg border p-3 transition-colors ${
            selectedLocationPoint?.id === point.id
              ? "border-blue-500 bg-blue-50"
              : "border-slate-200 hover:border-slate-300"
          }`}
          onClick={() => setSelectedLocationPoint(point)}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {index + 1}. {point.name}
            </span>
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onEdit(point)
                }}
                className="rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
              >
                编辑
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(point.id)
                }}
                className="rounded bg-red-50 px-2 py-1 text-xs text-red-600 hover:bg-red-100"
              >
                删除
              </button>
            </div>
          </div>
          {point.stayHours && (
            <p className="mt-1 text-xs text-slate-500">
              停留 {point.stayHours} 小时
            </p>
          )}
          {point.notes && (
            <p className="mt-1 text-xs text-slate-400">{point.notes}</p>
          )}
        </li>
      ))}
    </ul>
  )
}
