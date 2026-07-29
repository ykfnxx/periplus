"use client"

import { useCallback, useEffect, useRef } from "react"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function LocationInfoBubble() {
  const map = useWorkspaceStore((state) => state.map)
  const selectedLocationPoint = useWorkspaceStore(
    (state) => state.selectedLocationPoint
  )
  const selectedLocationAnchor = useWorkspaceStore(
    (state) => state.selectedLocationAnchor
  )
  const overlayRef = useRef<HTMLDivElement | null>(null)

  const updatePosition = useCallback(() => {
    if (!map || !selectedLocationPoint || !overlayRef.current) return

    const anchor = selectedLocationAnchor ?? selectedLocationPoint
    const pixel = map.lngLatToContainer(new AMap.LngLat(anchor.lng, anchor.lat))

    overlayRef.current.style.left = `${pixel.getX()}px`
    overlayRef.current.style.top = `${pixel.getY() - 24}px`
  }, [map, selectedLocationPoint, selectedLocationAnchor])

  useEffect(() => {
    if (!map) return

    map.on("mapmove", updatePosition)
    map.on("zoomchange", updatePosition)

    return () => {
      map.off("mapmove", updatePosition)
      map.off("zoomchange", updatePosition)
    }
  }, [map, updatePosition])

  useEffect(() => {
    updatePosition()
  }, [updatePosition])

  if (!selectedLocationPoint) return null

  return (
    <div
      ref={overlayRef}
      onClick={(event) => event.stopPropagation()}
      className="pointer-events-auto absolute z-50 w-[200px] -translate-x-1/2 -translate-y-full"
    >
      <div className="relative rounded-xl border-2 border-russet bg-soft-white p-4 text-ink shadow-periplus">
        <h3 className="text-base leading-5 font-black">
          {selectedLocationPoint.name}
        </h3>
        {selectedLocationPoint.durationMinutes !== undefined ? (
          <p className="mt-2 text-[11px] font-bold text-teak">
            建议停留 {formatDuration(selectedLocationPoint.durationMinutes)}
          </p>
        ) : null}
        {selectedLocationPoint.notes ? (
          <p className="mt-2 text-[13px] leading-5 text-walnut">
            {selectedLocationPoint.notes}
          </p>
        ) : null}
        <p className="mt-3 text-[10px] font-black text-russet">
          当前行程卡已定位
        </p>
        <div className="absolute -bottom-2 left-1/2 h-0 w-0 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent border-t-soft-white" />
      </div>
    </div>
  )
}

function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = minutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`
}
