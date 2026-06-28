'use client';

import { useEffect } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { periplusColors } from '@/lib/ui/map-theme';

export default function RoutePolyline() {
  const map = useMapStore((s) => s.map);
  const currentRoute = useMapStore((s) => s.currentRoute);

  useEffect(() => {
    if (!map || !currentRoute || currentRoute.points.length < 2) return;

    const path = [...currentRoute.points]
      .sort((a, b) => a.order - b.order)
      .map((p) => new AMap.LngLat(p.lng, p.lat));

    const polyline = new AMap.Polyline({
      path,
      strokeColor: periplusColors.russet,
      strokeWeight: 6,
      strokeOpacity: 0.9,
      lineJoin: 'round',
      lineCap: 'round',
      showDir: true,
    });

    map.add(polyline);

    // Fit bounds
    map.setFitView([polyline], false, [60, 60, 60, 60], 10);

    return () => {
      map.remove(polyline);
    };
  }, [map, currentRoute]);

  return null;
}
