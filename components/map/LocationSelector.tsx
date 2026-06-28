'use client';

import { useEffect } from 'react';
import { useMapStore } from '@/stores/mapStore';

export default function LocationSelector() {
  const map = useMapStore((s) => s.map);
  const isSelectingLocation = useMapStore((s) => s.isSelectingLocation);
  const locationSelectionMode = useMapStore((s) => s.locationSelectionMode);
  const pendingPhotoDataUrl = useMapStore((s) => s.pendingPhotoDataUrl);
  const addPhotoShare = useMapStore((s) => s.addPhotoShare);
  const setPointSelectionDraft = useMapStore((s) => s.setPointSelectionDraft);
  const clearLocationSelection = useMapStore((s) => s.clearLocationSelection);

  useEffect(() => {
    if (!map || !isSelectingLocation) return;

    // Add a visual indicator that we're in selection mode
    const mapContainer = map.getContainer();
    if (mapContainer) {
      mapContainer.style.cursor = 'crosshair';
    }

    const clickHandler = (e: AMap.MapsEvent<'click', AMap.Map>) => {
      const lng = e.lnglat.getLng();
      const lat = e.lnglat.getLat();

      if (locationSelectionMode === 'photo' && pendingPhotoDataUrl) {
        addPhotoShare({
          lat,
          lng,
          imageDataUrl: pendingPhotoDataUrl,
          caption: '',
        });
        clearLocationSelection();
        return;
      }

      if (locationSelectionMode === 'point') {
        setPointSelectionDraft({ lat, lng });
        clearLocationSelection();
      }
    };

    map.on('click', clickHandler);

    return () => {
      map.off('click', clickHandler);
      if (mapContainer) {
        mapContainer.style.cursor = '';
      }
    };
  }, [
    map,
    isSelectingLocation,
    locationSelectionMode,
    pendingPhotoDataUrl,
    addPhotoShare,
    setPointSelectionDraft,
    clearLocationSelection,
  ]);

  return null;
}
