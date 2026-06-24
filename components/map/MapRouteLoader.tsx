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
    let mounted = true;

    if (routeId === 'preset-silk-road') {
      setCurrentRoute(silkRoadRoute);
    } else if (routeId) {
      fetch(`/api/routes/${routeId}`)
        .then((res) => {
          if (!res.ok) throw new Error('Route not found');
          return res.json();
        })
        .then((data) => {
          if (mounted) setCurrentRoute(data);
        })
        .catch(() => {
          if (mounted) setCurrentRoute(null);
        });
    } else {
      setCurrentRoute(null);
    }

    return () => {
      mounted = false;
    };
  }, [routeId, setCurrentRoute]);

  return null;
}
