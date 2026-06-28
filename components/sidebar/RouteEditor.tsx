'use client';

import { useState } from 'react';
import { createRoute, updateRoute } from '@/lib/routes/client';
import { useMapStore } from '@/stores/mapStore';
import type { RoutePoint } from '@/types/route';
import PointList from './PointList';
import PointForm from './PointForm';

export default function RouteEditor() {
  const currentRoute = useMapStore((s) => s.currentRoute);
  const setCurrentRoute = useMapStore((s) => s.setCurrentRoute);
  const [editingPoint, setEditingPoint] = useState<RoutePoint | null>(null);
  const [showForm, setShowForm] = useState(false);

  const handleAdd = (data: Omit<RoutePoint, 'id'>) => {
    if (!currentRoute) return;

    const newPoint: RoutePoint = {
      ...data,
      id: `temp-${Date.now()}`,
      order: currentRoute.points.length,
    };

    setCurrentRoute({
      ...currentRoute,
      points: [...currentRoute.points, newPoint],
    });
    setShowForm(false);
  };

  const handleEdit = (data: Omit<RoutePoint, 'id'>) => {
    if (!currentRoute || !editingPoint) return;

    const updatedPoints = currentRoute.points.map((p) =>
      p.id === editingPoint.id ? { ...p, ...data } : p
    );

    setCurrentRoute({ ...currentRoute, points: updatedPoints });
    setEditingPoint(null);
  };

  const handleDelete = (pointId: string) => {
    if (!currentRoute) return;

    const filtered = currentRoute.points.filter((p) => p.id !== pointId);
    // Reorder
    const reordered = filtered.map((p, i) => ({ ...p, order: i }));

    setCurrentRoute({ ...currentRoute, points: reordered });
  };

  const handleSave = async () => {
    if (!currentRoute) return;

    const isNewRoute = currentRoute.id.startsWith('preset-') || currentRoute.id.startsWith('temp-');
    const method = isNewRoute ? 'POST' : 'PUT';

    try {
      const input = {
        name: currentRoute.name,
        description: currentRoute.description,
        points: currentRoute.points,
      };
      const saved = method === 'POST'
        ? await createRoute(input)
        : await updateRoute(currentRoute.id, input);
      setCurrentRoute(saved);
      alert('保存成功');
    } catch {
      alert('网络错误，请稍后重试');
    }
  };

  if (!currentRoute) {
    return (
      <div className="flex flex-col h-full">
        <p className="text-sm text-slate-400 flex-1">请从首页选择一个路线或创建新路线</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3">
        <h2 className="text-lg font-semibold">{currentRoute.name}</h2>
        {currentRoute.description && (
          <p className="text-xs text-slate-500 mt-1">{currentRoute.description}</p>
        )}
      </div>

      <PointList
        onEdit={(point) => {
          setEditingPoint(point);
          setShowForm(true);
        }}
        onDelete={handleDelete}
      />

      {showForm && (
        <PointForm
          point={editingPoint}
          onSubmit={editingPoint ? handleEdit : handleAdd}
          onCancel={() => {
            setShowForm(false);
            setEditingPoint(null);
          }}
        />
      )}

      <div className="mt-3 pt-3 border-t flex gap-2">
        <button
          onClick={() => {
            setEditingPoint(null);
            setShowForm(true);
          }}
          className="flex-1 px-4 py-2 bg-slate-100 rounded text-sm hover:bg-slate-200"
        >
          + 添加地点
        </button>
        <button
          onClick={handleSave}
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          保存路线
        </button>
      </div>
    </div>
  );
}
