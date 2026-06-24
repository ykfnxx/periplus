'use client';

import { useEffect } from 'react';
import { useMapStore } from '@/stores/mapStore';

export default function RouteMarkers() {
  const map = useMapStore((s) => s.map);
  const currentRoute = useMapStore((s) => s.currentRoute);
  const setSelectedPoint = useMapStore((s) => s.setSelectedPoint);

  useEffect(() => {
    if (!map || !currentRoute || currentRoute.points.length === 0) return;

    const markers: AMap.Marker[] = [];

    currentRoute.points
      .sort((a, b) => a.order - b.order)
      .forEach((point, index) => {
        const marker = new AMap.Marker({
          position: new AMap.LngLat(point.lng, point.lat),
          title: point.name,
          label: {
            content: `${index + 1}. ${point.name}`,
            direction: 'top',
          },
        });

        marker.on('click', () => {
          setSelectedPoint(point);
        });

        markers.push(marker);
      });

    map.add(markers);

    return () => {
      map.remove(markers);
    };
  }, [map, currentRoute, setSelectedPoint]);

  return null;
}
