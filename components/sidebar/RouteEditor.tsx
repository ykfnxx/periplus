'use client';

import { useEffect, useState } from 'react';
import { createRoute, updateRoute } from '@/lib/routes/client';
import { useMapStore } from '@/stores/mapStore';
import type { RouteEdge, RouteNode } from '@/types/route';
import PointList from './PointList';
import PointForm from './PointForm';

function edgesForNodes(routeId: string, nodes: RouteNode[]): RouteEdge[] {
  const sortedNodes = [...nodes].sort((a, b) => a.order - b.order)
  return sortedNodes.slice(1).map((node, index) => ({
    id: `temp-edge-${index}-${Date.now()}`,
    routeId,
    fromNodeId: sortedNodes[index].id,
    toNodeId: node.id,
    status: "INCOMPLETE",
  }))
}

export default function RouteEditor() {
  const currentRoute = useMapStore((s) => s.currentRoute);
  const setCurrentRoute = useMapStore((s) => s.setCurrentRoute);
  const currentRouteId = currentRoute?.id ?? null;
  const [editingPoint, setEditingPoint] = useState<RouteNode | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{
    routeId: string;
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    setSaveStatus((status) =>
      status?.routeId === currentRouteId ? status : null
    );
  }, [currentRouteId]);

  const handleAdd = (data: Omit<RouteNode, 'id' | 'routeId'>) => {
    if (!currentRoute) return;

    const newPoint: RouteNode = {
      ...data,
      id: `temp-${Date.now()}`,
      routeId: currentRoute.id,
      order: currentRoute.nodes.length,
    };
    const nodes = [...currentRoute.nodes, newPoint]

    setCurrentRoute({
      ...currentRoute,
      nodes,
      edges: edgesForNodes(currentRoute.id, nodes),
    });
    setSaveStatus(null);
    setShowForm(false);
  };

  const handleEdit = (data: Omit<RouteNode, 'id' | 'routeId'>) => {
    if (!currentRoute || !editingPoint) return;

    const updatedPoints = currentRoute.nodes.map((p) =>
      p.id === editingPoint.id ? { ...p, ...data } : p
    );

    setCurrentRoute({ ...currentRoute, nodes: updatedPoints });
    setSaveStatus(null);
    setEditingPoint(null);
  };

  const handleDelete = (pointId: string) => {
    if (!currentRoute) return;

    const filtered = currentRoute.nodes.filter((p) => p.id !== pointId);
    const reordered = filtered.map((p, i) => ({ ...p, order: i }));

    setCurrentRoute({
      ...currentRoute,
      nodes: reordered,
      edges: edgesForNodes(currentRoute.id, reordered),
      subPlans: currentRoute.subPlans.filter(
        (subPlan) => subPlan.routeNodeId !== pointId
      ),
    });
    setSaveStatus(null);
  };

  const handleSave = async () => {
    if (!currentRoute) return;

    setSaveStatus(null);
    const isNewRoute = currentRoute.id.startsWith('preset-') || currentRoute.id.startsWith('temp-');
    const method = isNewRoute ? 'POST' : 'PUT';

    try {
      const input = {
        name: currentRoute.name,
        description: currentRoute.description,
        nodes: currentRoute.nodes,
        edges: currentRoute.edges,
        subPlans: currentRoute.subPlans,
      };
      const saved = method === 'POST'
        ? await createRoute(input)
        : await updateRoute(currentRoute.id, input);
      setCurrentRoute(saved);
      setSaveStatus({ routeId: saved.id, type: 'success', message: '保存成功' });
    } catch {
      setSaveStatus({
        routeId: currentRoute.id,
        type: 'error',
        message: '网络错误，请稍后重试',
      });
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

      <div className="mt-3 pt-3 border-t">
        {saveStatus?.routeId === currentRoute.id && (
          <p
            className={`mb-2 text-xs ${
              saveStatus.type === 'success' ? 'text-emerald-700' : 'text-red-600'
            }`}
          >
            {saveStatus.message}
          </p>
        )}
        <div className="flex gap-2">
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
    </div>
  );
}
