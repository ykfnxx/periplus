"use client"
import { MAX_PHOTO_CAPTION_LENGTH } from "@/modules/data-model/contracts"
import { useState } from "react"
import {
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  MapPin,
} from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type { PhotoItem } from "../photo-items"
import MediaGallery from "./MediaGallery"
import { Modal } from "./Modal"
import UserSource from "./UserSource"

function PhotoCaption({ caption }: { caption: string }) {
  const [expanded, setExpanded] = useState(false)
  if (!caption) return null
  return (
    <button
      type="button"
      aria-label="照片描述"
      aria-expanded={expanded}
      className="journal-photo-caption pointer-events-auto min-w-0 text-left"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setExpanded(true)
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") setExpanded(false)
      }}
      onFocus={(event) => {
        if (event.currentTarget.matches(":focus-visible")) setExpanded(true)
      }}
      onBlur={() => setExpanded(false)}
      onClick={(event) => {
        if (event.detail === 0 || !window.matchMedia("(hover: hover)").matches)
          setExpanded((value) => !value)
      }}
    >
      <span className={expanded ? "block whitespace-pre-wrap" : "line-clamp-1"}>
        {caption.slice(0, MAX_PHOTO_CAPTION_LENGTH)}
        {expanded && (
          <ChevronDown size={15} className="ml-2 inline-block align-middle" />
        )}
      </span>
      {!expanded && <ChevronUp size={15} className="shrink-0" />}
    </button>
  )
}

export default function PhotoViewer({
  photos,
  initialIndex = 0,
  onClose,
  onOpenEvent,
}: {
  photos: PhotoItem[]
  initialIndex?: number
  onOpenEvent?: (photo: PhotoItem) => void
  onClose: () => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const current = Math.min(index, Math.max(0, photos.length - 1))
  const photo = photos[current]
  if (!photo) return null
  return (
    <Modal
      title="照片"
      hideTitle
      onClose={onClose}
      closeClassName="right-5! rounded-full! bg-photo-overlay! text-white!"
      backdropClassName="bg-photo-overlay"
      className="journal-photo-viewer h-[min(756px,calc(100dvh-64px))]! w-[min(1176px,calc(100vw-64px))]! max-w-none! overflow-hidden! rounded-2xl! border-none! bg-photo-stage! p-0! ring-0! max-sm:h-dvh! max-sm:max-h-none! max-sm:w-screen! max-sm:rounded-none!"
    >
      {() => (
        <div className="journal-photo-stage relative h-full">
          <MediaGallery
            photos={photos}
            index={current}
            onIndex={setIndex}
            globalKeys
          />
          {photos.length > 1 && (
            <>
              <Button
                variant="ghost"
                shape="circle"
                aria-label="上一张照片"
                disabled={current === 0}
                onClick={() => setIndex(current - 1)}
                className="journal-photo-nav left-4 bg-white/70! text-journal-ink! hover:bg-white/90!"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                shape="circle"
                aria-label="下一张照片"
                disabled={current === photos.length - 1}
                onClick={() => setIndex(current + 1)}
                className="journal-photo-nav right-4 bg-white/70! text-journal-ink! hover:bg-white/90!"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </Button>
            </>
          )}
          {(photo.caption || photo.location || photo.source || onOpenEvent) && (
            <footer className="journal-photo-meta pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-6">
              <div className="min-w-0">
                {photo.source && (
                  <UserSource user={photo.source} className="mb-2 text-white" />
                )}
                <PhotoCaption key={photo.id} caption={photo.caption} />
                {onOpenEvent && (
                  <button
                    type="button"
                    className="pointer-events-auto mt-2 flex items-center gap-1 text-sm text-white underline-offset-4 hover:underline"
                    onClick={() => onOpenEvent(photo)}
                  >
                    {photo.journeyTitle || photo.eventTitle}{" "}
                    <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
              {photo.location && (
                <span
                  className="journal-photo-location ml-auto flex min-w-0 shrink-0 items-center gap-2"
                  title={photo.location.address || photo.location.name}
                >
                  <MapPin size={18} className="shrink-0" />
                  <span className="max-w-48 min-w-0 truncate">
                    {photo.location.name}
                  </span>
                </span>
              )}
            </footer>
          )}
        </div>
      )}
    </Modal>
  )
}
