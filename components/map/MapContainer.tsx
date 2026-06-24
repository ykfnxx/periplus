'use client';

import { useEffect, useRef } from 'react';
import { loadAMap } from '@/lib/amap';
import { useMapStore } from '@/stores/mapStore';

export default function MapContainer() {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const setMap = useMapStore((s) => s.setMap);

  useEffect(() => {
    let mapInstance: AMap.Map | null = null;
    let mounted = true;

    loadAMap()
      .then((AMap) => {
        if (!mounted || !mapDivRef.current) return;

        mapInstance = new AMap.Map(mapDivRef.current, {
          zoom: 5,
          center: [104.5, 36.5],
          viewMode: '2D',
        });

        mapInstance.addControl(new AMap.Scale());
        mapInstance.addControl(new AMap.ToolBar());

        if (mounted) {
          setMap(mapInstance);
        }
      })
      .catch((err) => {
        console.error('Failed to load AMap:', err);
      });

    return () => {
      mounted = false;
      mapInstance?.destroy();
      setMap(null);
    };
  }, [setMap]);

  return (
    <div
      ref={mapDivRef}
      className="w-full h-full"
      style={{ minHeight: '100%' }}
    />
  );
}
