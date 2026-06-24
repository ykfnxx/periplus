'use client';

import { useState } from 'react';
import { RoutePoint } from '@/stores/mapStore';

interface PointFormProps {
  point?: RoutePoint | null;
  onSubmit: (data: Omit<RoutePoint, 'id'>) => void;
  onCancel: () => void;
}

export default function PointForm({ point, onSubmit, onCancel }: PointFormProps) {
  const [name, setName] = useState(point?.name || '');
  const [lat, setLat] = useState(point?.lat?.toString() || '');
  const [lng, setLng] = useState(point?.lng?.toString() || '');
  const [stayDays, setStayDays] = useState(point?.stayDays?.toString() || '');
  const [notes, setNotes] = useState(point?.notes || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      name: name.trim(),
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      order: point?.order ?? 0,
      stayDays: stayDays ? parseInt(stayDays) : undefined,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-t pt-3">
      <h3 className="text-sm font-semibold">
        {point ? '编辑地点' : '添加地点'}
      </h3>
      <input
        type="text"
        placeholder="地点名称"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full px-3 py-2 border rounded text-sm"
        required
      />
      <div className="flex gap-2">
        <input
          type="number"
          step="any"
          placeholder="纬度"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          className="flex-1 px-3 py-2 border rounded text-sm"
          required
        />
        <input
          type="number"
          step="any"
          placeholder="经度"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          className="flex-1 px-3 py-2 border rounded text-sm"
          required
        />
      </div>
      <input
        type="number"
        placeholder="停留天数（可选）"
        value={stayDays}
        onChange={(e) => setStayDays(e.target.value)}
        className="w-full px-3 py-2 border rounded text-sm"
      />
      <textarea
        placeholder="备注（可选）"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        className="w-full px-3 py-2 border rounded text-sm h-16 resize-none"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          {point ? '保存' : '添加'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 bg-slate-100 rounded text-sm hover:bg-slate-200"
        >
          取消
        </button>
      </div>
    </form>
  );
}
