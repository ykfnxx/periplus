'use client';

import { useMapStore, RoutePoint } from '@/stores/mapStore';

interface PointListProps {
  onEdit: (point: RoutePoint) => void;
  onDelete: (pointId: string) => void;
}

export default function PointList({ onEdit, onDelete }: PointListProps) {
  const currentRoute = useMapStore((s) => s.currentRoute);
  const selectedPoint = useMapStore((s) => s.selectedPoint);
  const setSelectedPoint = useMapStore((s) => s.setSelectedPoint);

  if (!currentRoute || currentRoute.points.length === 0) {
    return <p className="text-sm text-slate-400">暂无地点，点击添加</p>;
  }

  const sortedPoints = [...currentRoute.points].sort((a, b) => a.order - b.order);

  return (
    <ul className="space-y-2 flex-1 overflow-auto">
      {sortedPoints.map((point, index) => (
        <li
          key={point.id}
          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
            selectedPoint?.id === point.id
              ? 'border-blue-500 bg-blue-50'
              : 'border-slate-200 hover:border-slate-300'
          }`}
          onClick={() => setSelectedPoint(point)}
        >
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {index + 1}. {point.name}
            </span>
            <div className="flex gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(point);
                }}
                className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200"
              >
                编辑
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(point.id);
                }}
                className="text-xs px-2 py-1 rounded bg-red-50 text-red-600 hover:bg-red-100"
              >
                删除
              </button>
            </div>
          </div>
          {point.stayDays && (
            <p className="text-xs text-slate-500 mt-1">停留 {point.stayDays} 天</p>
          )}
          {point.notes && (
            <p className="text-xs text-slate-400 mt-1">{point.notes}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
