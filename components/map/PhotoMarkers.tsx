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
      // Custom DOM content: circular thumbnail
      const content = document.createElement('div');
      content.className = 'photo-marker';
      content.innerHTML = `
        <div style="
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 2px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          overflow: hidden;
          cursor: pointer;
        ">
          <img src="${photo.imageDataUrl}" style="width: 100%; height: 100%; object-fit: cover;" />
        </div>
      `;

      const marker = new AMap.Marker({
        position: new AMap.LngLat(photo.lng, photo.lat),
        content: content,
        offset: new AMap.Pixel(-20, -20), // Center the 40px marker
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
