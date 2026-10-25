"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
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
  const step = (direction: -1 | 1) => {
    const node = rail.current
    if (!node) return
    const items = Array.from(node.children) as HTMLElement[]
    const start = items[0]?.offsetLeft ?? 0
    const current = items.reduce(
      (closest, item, index) =>
        Math.abs(item.offsetLeft - start - node.scrollLeft) <
        Math.abs(items[closest].offsetLeft - start - node.scrollLeft)
          ? index
          : closest,
      0
    )
    const next = items[current + direction]
    if (!next) return
    node.scrollTo({
      left: next.offsetLeft - start,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    })
  }
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
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return
          event.preventDefault()
          event.stopPropagation()
          step(event.key === "ArrowLeft" ? -1 : 1)
        }}
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
      {photos.length > 1 && (
        <>
          <Button
            variant="ghost"
            shape="circle"
            aria-label="上一张照片"
            disabled={!edges.left}
            onClick={() => step(-1)}
            className="journal-photo-nav left-2 bg-white/70! text-journal-ink! hover:bg-white/90!"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            shape="circle"
            aria-label="下一张照片"
            disabled={!edges.right}
            onClick={() => step(1)}
            className="journal-photo-nav right-2 bg-white/70! text-journal-ink! hover:bg-white/90!"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </Button>
        </>
      )}
    </div>
  )
}
