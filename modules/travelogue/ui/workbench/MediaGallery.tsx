"use client"
import { useEffect, useRef } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
export type GalleryPhoto = {
  id: string
  url: string
  caption: string
  pending?: boolean
}
export default function MediaGallery({
  photos,
  index,
  onIndex,
  onImageClick,
  keyboard = true,
  fit = "contain",
  globalKeys = false,
}: {
  photos: GalleryPhoto[]
  index: number
  onIndex: (index: number) => void
  onImageClick?: () => void
  keyboard?: boolean
  fit?: "contain" | "cover"
  globalKeys?: boolean
}) {
  const reduced = useReducedMotion()
  const swiped = useRef(false)
  const container = useRef<HTMLDivElement>(null)
  const photo = photos[index]
  useEffect(() => {
    if (!keyboard) return
    const key = (event: KeyboardEvent) => {
      if (!globalKeys && !container.current?.contains(event.target as Node))
        return
      if (
        (event.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true],[role=combobox],[role=tab]"
        )
      )
        return
      const next =
        index +
        (event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0)
      if (next !== index && next >= 0 && next < photos.length) {
        event.preventDefault()
        event.stopPropagation()
        onIndex(next)
      }
    }
    window.addEventListener("keydown", key, true)
    return () => window.removeEventListener("keydown", key, true)
  }, [index, photos.length, onIndex, keyboard, globalKeys])
  if (!photo) return null
  const image = (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.img
        key={photo.id}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduced ? 0 : 0.16 }}
        src={photo.url}
        alt={photo.caption || `旅行照片 ${index + 1}`}
        draggable={false}
        className={`h-full w-full ${fit === "cover" ? "object-cover" : "object-contain"}`}
      />
    </AnimatePresence>
  )
  return (
    <div
      ref={container}
      className="relative h-full min-h-0 overflow-hidden bg-photo-stage text-white"
      role="region"
      aria-label="照片轮播"
    >
      <motion.div
        className="h-full w-full touch-pan-y"
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.12}
        onPointerDown={() => {
          swiped.current = false
        }}
        onDragStart={() => {
          swiped.current = true
        }}
        onDragEnd={(_, info) => {
          if (Math.abs(info.offset.x) > 45 || Math.abs(info.velocity.x) > 500) {
            const next = index + (info.offset.x < 0 ? 1 : -1)
            if (next >= 0 && next < photos.length) onIndex(next)
          }
        }}
      >
        {onImageClick ? (
          <button
            type="button"
            aria-label="打开照片大图"
            className="h-full w-full cursor-zoom-in"
            onClick={() => {
              if (!swiped.current) onImageClick()
            }}
          >
            {image}
          </button>
        ) : (
          image
        )}
      </motion.div>
      <Button
        variant="ghost"
        shape="circle"
        size="sm"
        aria-label="上一张照片"
        disabled={index === 0}
        onClick={() => onIndex(index - 1)}
        className="absolute top-1/2 left-2 -translate-y-1/2 bg-photo-overlay text-white disabled:invisible"
      >
        <ChevronLeft size={18} />
      </Button>
      <Button
        variant="ghost"
        shape="circle"
        size="sm"
        aria-label="下一张照片"
        disabled={index === photos.length - 1}
        onClick={() => onIndex(index + 1)}
        className="absolute top-1/2 right-2 -translate-y-1/2 bg-photo-overlay text-white disabled:invisible"
      >
        <ChevronRight size={18} />
      </Button>
      <span
        aria-live="polite"
        aria-label="照片序号"
        className="pointer-events-none absolute top-3 right-3 rounded-full bg-photo-overlay px-3 py-1.5 text-xs tabular-nums"
      >
        {index + 1}/{photos.length}
      </span>
    </div>
  )
}
