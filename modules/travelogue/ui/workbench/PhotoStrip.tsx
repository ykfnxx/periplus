"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/kumo/components/button/button"
import type { RecordingEvent } from "@/modules/data-model/contracts/recording"

export default function PhotoStrip({
  photos,
  title,
  onOpen,
}: {
  photos: RecordingEvent["photos"]
  title: string
  onOpen: (index: number) => void
}) {
  const rail = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const measure = useCallback(() => {
    const node = rail.current
    if (!node) return
    const left = node.scrollLeft > 1
    const right = node.scrollLeft + node.clientWidth < node.scrollWidth - 1
    setEdges((current) =>
      current.left === left && current.right === right
        ? current
        : { left, right }
    )
  }, [])
  useEffect(() => {
    const node = rail.current
    if (!node) return
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [measure, photos.length])
  return (
    <div className="journal-photo-strip">
      <div
        ref={rail}
        data-photo-strip=""
        role="region"
        tabIndex={0}
        aria-label={`${title}的照片`}
        className="flex gap-2 overflow-x-auto overscroll-x-contain"
        onScroll={measure}
      >
        {photos.map((photo, index) => (
          <Button
            key={photo.assetId}
            variant="ghost"
            onClick={() => onOpen(index)}
            aria-label={`查看${title}的照片 ${index + 1}`}
            className="relative shrink-0 overflow-hidden p-0!"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={photo.caption || ""}
              loading="lazy"
              draggable={false}
              className="h-full w-full object-cover"
            />
          </Button>
        ))}
      </div>
      {edges.left && (
        <span
          aria-hidden="true"
          data-photo-edge="left"
          className="journal-photo-edge journal-photo-edge-left"
        />
      )}
      {edges.right && (
        <span
          aria-hidden="true"
          data-photo-edge="right"
          className="journal-photo-edge journal-photo-edge-right"
        />
      )}
    </div>
  )
}
