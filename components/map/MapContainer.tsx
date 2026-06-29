'use client';

import { useEffect, useRef, useState } from 'react';
import { loadAMap } from '@/lib/amap';
import RoutePolyline from './RoutePolyline';
import RouteMarkers from './RouteMarkers';
import PhotoMarkers from './PhotoMarkers';
import PhotoInfoWindow from './PhotoInfoWindow';
import LocationSelector from './LocationSelector';
import MapSettingsButton from './MapSettingsButton';
import { useMapStore } from '@/stores/mapStore';

export default function MapContainer() {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const setMap = useMapStore((s) => s.setMap);

  useEffect(() => {
    let mapInstance: AMap.Map | null = null;
    let mounted = true;

    loadAMap()
      .then((AMap) => {
        if (!mounted || !mapDivRef.current) return;
        setError(null);

        mapInstance = new AMap.Map(mapDivRef.current, {
          zoom: 5,
          center: [104.5, 36.5],
          viewMode: '2D',
          mapStyle: 'amap://styles/5fa99faa24edae66ca845a370693c754',
        });

        mapInstance.addControl(new AMap.Scale());

        if (mounted) {
          setMap(mapInstance);
        }
      })
      .catch((err) => {
        console.error('Failed to load AMap:', err);
        if (mounted) {
          setError('地图加载失败，请检查高德 Key 或网络连接');
        }
      });

    return () => {
      mounted = false;
      mapInstance?.destroy();
      setMap(null);
    };
  }, [setMap]);

  return (
    <>
      <div
        ref={mapDivRef}
        className="w-full h-full"
        style={{ minHeight: '100%' }}
      />
      {error && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-[var(--periplus-cream)]">
          <div className="max-w-sm rounded-lg border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)] p-4 text-sm text-[var(--periplus-walnut)] shadow-[var(--periplus-soft-shadow)]">
            {error}
          </div>
        </div>
      )}
      <RoutePolyline key="polyline" />
      <RouteMarkers key="markers" />
      <PhotoMarkers key="photo-markers" />
      <PhotoInfoWindow key="photo-info" />
      <LocationSelector key="location-selector" />
      {!error && <MapSettingsButton key="map-settings" />}
    </>
  );
}
