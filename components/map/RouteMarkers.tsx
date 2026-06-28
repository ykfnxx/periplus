'use client';

import { useEffect } from 'react';
import { useMapStore } from '@/stores/mapStore';
import { periplusColors, routeMarkerColors } from '@/lib/ui/map-theme';

export default function RouteMarkers() {
  const map = useMapStore((s) => s.map);
  const currentRoute = useMapStore((s) => s.currentRoute);
  const setSelectedPoint = useMapStore((s) => s.setSelectedPoint);

  useEffect(() => {
    if (!map || !currentRoute || currentRoute.points.length === 0) return;

    const markers: AMap.Marker[] = [];

    const sortedPoints = [...currentRoute.points].sort((a, b) => a.order - b.order);

    sortedPoints.forEach((point, index) => {
      const content = document.createElement('div');
      const markerColor = routeMarkerColors[index % routeMarkerColors.length];
      content.className = `periplus-map-marker ${
        markerColor === periplusColors.mustard || markerColor === periplusColors.bluegray
          ? 'periplus-map-marker--mustard'
          : ''
      }`;
      content.style.background = markerColor;
      content.textContent = `${index + 1}`;

      const marker = new AMap.Marker({
        content,
        position: new AMap.LngLat(point.lng, point.lat),
        title: point.name,
        offset: new AMap.Pixel(-17, -17),
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
