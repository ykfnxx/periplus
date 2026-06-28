'use client';

import { useEffect } from 'react';
import { useMapStore } from '@/stores/mapStore';

export default function PhotoMarkers() {
  const map = useMapStore((s) => s.map);
  const photoShares = useMapStore((s) => s.photoShares);
  const setSelectedPhotoShare = useMapStore((s) => s.setSelectedPhotoShare);

  useEffect(() => {
    if (!map || photoShares.length === 0) return;

    const markers: AMap.Marker[] = [];

    photoShares.forEach((photo) => {
      const content = document.createElement('div');
      content.className = 'periplus-photo-marker';
      content.innerHTML = `<img src="${photo.imageDataUrl}" alt="" style="width:100%;height:100%;object-fit:cover;" />`;

      const marker = new AMap.Marker({
        position: new AMap.LngLat(photo.lng, photo.lat),
        content,
        offset: new AMap.Pixel(-24, -24),
      });

      marker.on('click', () => {
        setSelectedPhotoShare(photo);
      });

      markers.push(marker);
    });

    map.add(markers);

    return () => {
      map.remove(markers);
    };
  }, [map, photoShares, setSelectedPhotoShare]);

  return null;
}
