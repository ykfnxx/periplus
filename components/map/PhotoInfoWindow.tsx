"use client"

import { Trash2 } from "lucide-react"
import { type MouseEvent, useCallback, useEffect, useRef } from "react"
import { deletePhoto } from "@/lib/photos/client"
import { useMapStore } from "@/stores/mapStore"

function formatUploadDate(timestamp: number) {
  const date = new Date(timestamp)
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}.${String(date.getDate()).padStart(2, "0")}`
}

export default function PhotoInfoWindow() {
  const map = useMapStore((state) => state.map)
  const selectedPhotoShare = useMapStore((state) => state.selectedPhotoShare)
  const setSelectedPhotoShare = useMapStore(
    (state) => state.setSelectedPhotoShare
  )
  const selectedPhotoAnchor = useMapStore((state) => state.selectedPhotoAnchor)
  const setLightboxPhotoShare = useMapStore(
    (state) => state.setLightboxPhotoShare
  )
  const removePhotoShare = useMapStore((state) => state.removePhotoShare)
  const isSelectingLocation = useMapStore((state) => state.isSelectingLocation)
  const overlayRef = useRef<HTMLDivElement | null>(null)

  const updatePosition = useCallback(() => {
    if (!map || !selectedPhotoShare || !overlayRef.current) return

    const anchor = selectedPhotoAnchor ?? selectedPhotoShare
    const pixel = map.lngLatToContainer(new AMap.LngLat(anchor.lng, anchor.lat))

    overlayRef.current.style.left = `${pixel.getX()}px`
    overlayRef.current.style.top = `${pixel.getY() - 10}px`
  }, [map, selectedPhotoShare, selectedPhotoAnchor])

  useEffect(() => {
    if (!map) return

    const mapClickHandler = () => {
      if (!isSelectingLocation) {
        setSelectedPhotoShare(null)
      }
    }
    const moveHandler = () => updatePosition()

    map.on("click", mapClickHandler)
    map.on("mapmove", moveHandler)
    map.on("zoomchange", moveHandler)

    return () => {
      map.off("click", mapClickHandler)
      map.off("mapmove", moveHandler)
      map.off("zoomchange", moveHandler)
    }
  }, [map, setSelectedPhotoShare, isSelectingLocation, updatePosition])

  useEffect(() => {
    updatePosition()
  }, [updatePosition])

  const handleDelete = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      event.stopPropagation()
      if (!selectedPhotoShare?.canDelete) return
      await deletePhoto(selectedPhotoShare.id)
      removePhotoShare(selectedPhotoShare.id)
    },
    [removePhotoShare, selectedPhotoShare]
  )

  const openLightbox = useCallback(
    (event: MouseEvent<HTMLImageElement>) => {
      event.stopPropagation()
      setLightboxPhotoShare(selectedPhotoShare)
    },
    [selectedPhotoShare, setLightboxPhotoShare]
  )

  const stopOverlayClick = useCallback((event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
  }, [])

  if (!selectedPhotoShare) return null

  return (
    <div
      ref={overlayRef}
      onClick={stopOverlayClick}
      className="absolute z-50 -translate-x-1/2 -translate-y-full"
      style={{ pointerEvents: "auto" }}
    >
      <div className="relative h-[120px] w-[120px] rounded-xl border border-ink-10 bg-soft-white p-1 shadow-[0_4px_16px_var(--color-ink-10)]">
        <img
          src={selectedPhotoShare.imageDataUrl}
          alt="照片"
          onClick={openLightbox}
          className="h-[112px] w-[112px] cursor-pointer rounded-lg object-cover"
        />
        {selectedPhotoShare.canDelete && (
          <button
            type="button"
            onClick={handleDelete}
            aria-label="删除照片"
            title="删除"
            className="absolute right-2 bottom-2 flex h-6 w-6 items-center justify-center rounded-full bg-ink-40 text-soft-white transition hover:bg-coral/90"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="absolute -bottom-2 left-1/2 h-0 w-0 -translate-x-1/2 border-t-4 border-r-4 border-l-4 border-t-soft-white border-r-transparent border-l-transparent" />
      <div className="absolute -bottom-7 left-1/2 -translate-x-1/2 rounded-full border border-ink-10 bg-soft-white/95 px-2 py-0.5 text-[11px] whitespace-nowrap text-teak">
        {formatUploadDate(selectedPhotoShare.createdAt)}
      </div>
    </div>
  )
}
