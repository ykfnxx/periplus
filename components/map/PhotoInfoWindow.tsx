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
      <div className="min-w-[220px] max-w-[320px] rounded-lg border border-[rgb(44_36_22_/_14%)] bg-[var(--periplus-soft-white)] p-3 shadow-[var(--periplus-shadow)]">
        <img
          src={selectedPhotoShare.imageDataUrl}
          alt="照片"
          className="w-full max-w-[296px] rounded-md object-cover"
          style={{ maxHeight: '200px' }}
        />
        {selectedPhotoShare.caption && (
          <p className="mt-2 break-words text-sm text-[var(--periplus-walnut)]">
            {selectedPhotoShare.caption}
          </p>
        )}
        <div className="mt-2 flex justify-end">
          <button
            onClick={handleDelete}
            className="rounded-md bg-[var(--periplus-russet)] px-3 py-1 text-xs font-black text-[var(--periplus-soft-white)] transition hover:bg-[var(--periplus-ink)]"
          >
            删除
          </button>
        </div>
        {/* Arrow pointing down to marker */}
        <div className="absolute left-1/2 -bottom-2 h-0 w-0 -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-[var(--periplus-soft-white)]" />
      </div>
    </div>
  );
}
