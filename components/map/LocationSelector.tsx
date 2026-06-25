'use client';

import { useEffect } from 'react';
import { useMapStore } from '@/stores/mapStore';

export default function LocationSelector() {
  const map = useMapStore((s) => s.map);
  const isSelectingLocation = useMapStore((s) => s.isSelectingLocation);
  const pendingPhotoDataUrl = useMapStore((s) => s.pendingPhotoDataUrl);
  const addPhotoShare = useMapStore((s) => s.addPhotoShare);
  const setIsSelectingLocation = useMapStore((s) => s.setIsSelectingLocation);
  const setPendingPhotoDataUrl = useMapStore((s) => s.setPendingPhotoDataUrl);

  useEffect(() => {
    if (!map || !isSelectingLocation || !pendingPhotoDataUrl) return;

    // Add a visual indicator that we're in selection mode
    const mapContainer = map.getContainer();
    if (mapContainer) {
      mapContainer.style.cursor = 'crosshair';
    }

    const clickHandler = (e: AMap.MapsEvent<'click', AMap.Map>) => {
      const lng = e.lnglat.getLng();
      const lat = e.lnglat.getLat();

      addPhotoShare({
        lat,
        lng,
        imageDataUrl: pendingPhotoDataUrl,
        caption: '',
      });

      setIsSelectingLocation(false);
      setPendingPhotoDataUrl(null);
    };

    map.on('click', clickHandler);

    return () => {
      map.off('click', clickHandler);
      if (mapContainer) {
        mapContainer.style.cursor = '';
      }
    };
  }, [map, isSelectingLocation, pendingPhotoDataUrl, addPhotoShare, setIsSelectingLocation, setPendingPhotoDataUrl]);

  return null;
}
