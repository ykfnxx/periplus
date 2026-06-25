'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useMapStore } from '@/stores/mapStore';

export default function PhotoInfoWindow() {
  const map = useMapStore((s) => s.map);
  const selectedPhotoShare = useMapStore((s) => s.selectedPhotoShare);
  const setSelectedPhotoShare = useMapStore((s) => s.setSelectedPhotoShare);
  const removePhotoShare = useMapStore((s) => s.removePhotoShare);
  const isSelectingLocation = useMapStore((s) => s.isSelectingLocation);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  // Convert lat/lng to pixel position on map
  const updatePosition = useCallback(() => {
    if (!map || !selectedPhotoShare || !overlayRef.current) return;

    const pixel = map.lngLatToContainer(
      new AMap.LngLat(selectedPhotoShare.lng, selectedPhotoShare.lat)
    );

    overlayRef.current.style.left = `${pixel.getX()}px`;
    overlayRef.current.style.top = `${pixel.getY() - 10}px`; // offset above marker
  }, [map, selectedPhotoShare]);

  useEffect(() => {
    if (!map) return;

    // Listen for map clicks to close the overlay
    // But only when we're NOT in location selection mode
    const mapClickHandler = () => {
      if (!isSelectingLocation) {
        setSelectedPhotoShare(null);
      }
    };

    map.on('click', mapClickHandler);

    // Update position when map moves/zooms
    const moveHandler = () => {
      updatePosition();
    };

    map.on('mapmove', moveHandler);
    map.on('zoomchange', moveHandler);

    return () => {
      map.off('click', mapClickHandler);
      map.off('mapmove', moveHandler);
      map.off('zoomchange', moveHandler);
    };
  }, [map, setSelectedPhotoShare, isSelectingLocation, updatePosition]);

  // Update position when selected photo changes
  useEffect(() => {
    updatePosition();
  }, [updatePosition]);

  const handleDelete = useCallback(() => {
    if (confirm('确定要删除这张照片分享吗？')) {
      removePhotoShare(selectedPhotoShare!.id);
      setSelectedPhotoShare(null);
    }
  }, [removePhotoShare, setSelectedPhotoShare, selectedPhotoShare]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    // Prevent click from bubbling to map
    e.stopPropagation();
  }, []);

  if (!selectedPhotoShare) return null;

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="absolute z-50 transform -translate-x-1/2 -translate-y-full"
      style={{ pointerEvents: 'auto' }}
    >
      <div className="bg-white rounded-lg shadow-lg p-3 min-w-[200px] max-w-[300px]">
        <img
          src={selectedPhotoShare.imageDataUrl}
          alt="照片"
          className="w-full max-w-[280px] rounded object-cover"
          style={{ maxHeight: '200px' }}
        />
        {selectedPhotoShare.caption && (
          <p className="text-sm text-slate-700 mt-2 break-words">
            {selectedPhotoShare.caption}
          </p>
        )}
        <div className="mt-2 flex justify-end">
          <button
            onClick={handleDelete}
            className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
          >
            删除
          </button>
        </div>
        {/* Arrow pointing down to marker */}
        <div className="absolute left-1/2 -bottom-2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-white" />
      </div>
    </div>
  );
}
