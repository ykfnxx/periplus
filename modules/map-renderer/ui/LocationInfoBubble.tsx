"use client"

import { useCallback, useEffect, useRef } from "react"
import { effectiveLocationOf } from "@/lib/journeys/locations"
import { selectSelectedWorkspaceEvent } from "@/modules/workspace/state/selectors"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

export default function LocationInfoBubble() {
  const map = useWorkspaceStore((state) => state.map)
  const selectedEvent = useWorkspaceStore(selectSelectedWorkspaceEvent)
  const selectedEventAnchor = useWorkspaceStore(
    (state) => state.selectedEventAnchor
  )
  const overlayRef = useRef<HTMLDivElement | null>(null)

  const updatePosition = useCallback(() => {
    if (!map || !selectedEvent || !overlayRef.current) return
    const location = effectiveLocationOf(selectedEvent)
    const anchor = selectedEventAnchor ?? location
    if (!anchor) return
    const pixel = map.lngLatToContainer(new AMap.LngLat(anchor.lng, anchor.lat))
    overlayRef.current.style.left = `${pixel.getX()}px`
    overlayRef.current.style.top = `${pixel.getY() - 24}px`
  }, [map, selectedEvent, selectedEventAnchor])

  useEffect(() => {
    if (!map) return
    map.on("mapmove", updatePosition)
    map.on("zoomchange", updatePosition)
    return () => {
      map.off("mapmove", updatePosition)
      map.off("zoomchange", updatePosition)
    }
  }, [map, updatePosition])

  useEffect(() => updatePosition(), [updatePosition])

  if (!selectedEvent || !effectiveLocationOf(selectedEvent)) return null
  return (
    <div
      ref={overlayRef}
      onClick={(event) => event.stopPropagation()}
      className="pointer-events-auto absolute z-50 w-[200px] -translate-x-1/2 -translate-y-full"
    >
      <div className="relative rounded-xl border-2 border-russet bg-soft-white p-4 text-ink shadow-periplus">
        <h3 className="text-base leading-5 font-black">
          {selectedEvent.title}
        </h3>
        {selectedEvent.body ? (
          <p className="mt-2 text-[13px] leading-5 text-walnut">
            {selectedEvent.body}
          </p>
        ) : null}
        <p className="mt-3 text-[10px] font-black text-russet">
          当前事件卡已定位
        </p>
        <div className="absolute -bottom-2 left-1/2 h-0 w-0 -translate-x-1/2 border-x-8 border-t-8 border-x-transparent border-t-soft-white" />
      </div>
    </div>
  )
}
