'use client';

import { useState, useEffect } from 'react';
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
  const [error, setError] = useState('');

  useEffect(() => {
    setName(point?.name || '');
    setLat(point?.lat?.toString() || '');
    setLng(point?.lng?.toString() || '');
    setStayDays(point?.stayDays?.toString() || '');
    setNotes(point?.notes || '');
    setError('');
  }, [point]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      setError('请输入有效的经纬度');
      return;
    }

    if (latNum < -90 || latNum > 90) {
      setError('纬度必须在 -90 到 90 之间');
      return;
    }

    if (lngNum < -180 || lngNum > 180) {
      setError('经度必须在 -180 到 180 之间');
      return;
    }

    onSubmit({
      name: name.trim(),
      lat: latNum,
      lng: lngNum,
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
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  );
}
