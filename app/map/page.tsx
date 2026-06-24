'use client';

import { useEffect } from 'react';
import MapContainer from '@/components/map/MapContainer';
import { useMapStore } from '@/stores/mapStore';
import { silkRoadRoute } from '@/lib/mock-routes';

export const dynamic = 'force-dynamic';

export default function MapPage() {
  const currentRoute = useMapStore((s) => s.currentRoute);
  const setCurrentRoute = useMapStore((s) => s.setCurrentRoute);
  useEffect(() => {
    // TODO(Task 5): Remove mock data loading, load from API instead
    if (!currentRoute) {
      setCurrentRoute(silkRoadRoute);
    }
  }, [setCurrentRoute, currentRoute]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <aside className="w-80 border-r border-slate-200 bg-white p-4 flex flex-col">
        <h2 className="text-lg font-semibold mb-4">路线编辑</h2>
        <p className="text-sm text-slate-500">Sidebar placeholder</p>
      </aside>
      <main className="flex-1 relative">
        <MapContainer />
      </main>
    </div>
  );
}
