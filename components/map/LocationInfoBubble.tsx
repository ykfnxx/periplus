"use client"

import { useCallback, useEffect, useRef } from "react"
import { useMapStore } from "@/stores/mapStore"

export default function LocationInfoBubble() {
  const map = useMapStore((state) => state.map)
  const selectedLocationPoint = useMapStore(
    (state) => state.selectedLocationPoint
  )
  const setSelectedLocationPoint = useMapStore(
    (state) => state.setSelectedLocationPoint
  )
  const overlayRef = useRef<HTMLDivElement | null>(null)

  const updatePosition = useCallback(() => {
    if (!map || !selectedLocationPoint || !overlayRef.current) return

    const pixel = map.lngLatToContainer(
      new AMap.LngLat(selectedLocationPoint.lng, selectedLocationPoint.lat)
    )

    overlayRef.current.style.left = `${pixel.getX()}px`
    overlayRef.current.style.top = `${pixel.getY() - 24}px`
  }, [map, selectedLocationPoint])

  useEffect(() => {
    if (!map) return

    const closeBubble = () => {
      setSelectedLocationPoint(null)
    }

    map.on("click", closeBubble)
    map.on("mapmove", updatePosition)
    map.on("zoomchange", updatePosition)

    return () => {
      map.off("click", closeBubble)
      map.off("mapmove", updatePosition)
      map.off("zoomchange", updatePosition)
    }
  }, [map, setSelectedLocationPoint, updatePosition])

  useEffect(() => {
    updatePosition()
  }, [updatePosition])

  if (!selectedLocationPoint) return null

  return (
    <div
      ref={overlayRef}
      onClick={(event) => event.stopPropagation()}
      className="absolute z-50 w-[200px] -translate-x-1/2 -translate-y-full"
      style={{ pointerEvents: "auto" }}
    >
      <div className="relative rounded-[12px] border border-[rgb(44_36_22_/_12%)] bg-[var(--periplus-soft-white)] p-3 text-[var(--periplus-ink)] shadow-[var(--periplus-shadow)]">
        <h3 className="text-base leading-5 font-semibold">
          {selectedLocationPoint.name}
        </h3>
        <p className="mt-1 text-xs font-bold text-[var(--periplus-teak)]">
          {selectedLocationPoint.lat.toFixed(4)},{" "}
          {selectedLocationPoint.lng.toFixed(4)}
        </p>
        {selectedLocationPoint.notes && (
          <p className="mt-2 text-[13px] leading-5 text-[var(--periplus-walnut)]">
            {selectedLocationPoint.notes}
          </p>
        )}
        {selectedLocationPoint.stayHours !== undefined && (
          <p className="mt-3 border-t border-[rgb(44_36_22_/_12%)] pt-2 text-xs font-bold text-[var(--periplus-teak)]">
            停留 {selectedLocationPoint.stayHours} 小时
          </p>
        )}
        <div className="absolute -bottom-2 left-1/2 h-0 w-0 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent border-t-[var(--periplus-soft-white)]" />
      </div>
    </div>
  )
}
