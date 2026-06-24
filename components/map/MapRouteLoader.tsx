'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMapStore } from '@/stores/mapStore';
import { silkRoadRoute } from '@/lib/mock-routes';

export default function MapRouteLoader() {
  const searchParams = useSearchParams();
  const routeId = searchParams.get('route');
  const setCurrentRoute = useMapStore((s) => s.setCurrentRoute);

  useEffect(() => {
    if (routeId === 'preset-silk-road') {
      setCurrentRoute(silkRoadRoute);
    } else if (routeId) {
      // Fetch from API
      fetch(`/api/routes/${routeId}`)
        .then((res) => res.json())
        .then((data) => setCurrentRoute(data))
        .catch(() => setCurrentRoute(null));
    } else {
      setCurrentRoute(null);
    }
  }, [routeId, setCurrentRoute]);

  return null;
}
