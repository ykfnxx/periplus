"use client"
import { useEffect, useRef, useState } from "react"
import { useStore } from "zustand"
import { ChevronDown, Pencil } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type { RecordingStore } from "../../state/recording-store"
import { eventTitle } from "../display"
import useRecordingViewport from "../useRecordingViewport"
import MediaGallery from "./MediaGallery"
import PhotoViewer from "./PhotoViewer"
import { photoItems } from "../photo-items"
import { Modal } from "./Modal"

/** Reading is a map-side surface; only the photo viewer and authoring are modal. */
export default function EventDetails({
  store,
  eventId,
  initialIndex,
  panelWidth,
  canEdit,
  editing,
  onClose,
  onEdit,
}: {
  store: RecordingStore
  eventId: string
  initialIndex: number
  panelWidth: number
  canEdit: boolean
  editing: boolean
  onClose: () => void
  onEdit: () => void
}) {
  const entry = useStore(store, (state) =>
    state.journey?.events.find((event) => event.id === eventId)
  )
  const [index, setIndex] = useState(initialIndex)
  const [lightbox, setLightbox] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const { width } = useRecordingViewport()
  const wide = width >= 1200
  useEffect(() => {
    const opener = document.activeElement
    if (wide) heading.current?.focus({ preventScroll: true })
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected)
        opener.focus({ preventScroll: true })
    }
  }, [wide])
  if (!entry) return null
  const photos = photoItems([entry])
  const current = Math.min(index, Math.max(0, photos.length - 1))
  const content = (
    <>
      <header className="flex shrink-0 items-center justify-between gap-3">
        <h2
          ref={heading}
          tabIndex={-1}
          id="expanded-event-title"
          className="min-w-0 truncate text-lg font-semibold outline-none"
        >
          {eventTitle(entry)}
        </h2>
        {wide && (
          <Button
            variant="ghost"
            shape="circle"
            size="xs"
            className="shrink-0 p-0!"
            aria-label="折叠事件"
            onClick={onClose}
          >
            <ChevronDown size={18} strokeWidth={1.75} />
          </Button>
        )}
      </header>
      <div
        tabIndex={0}
        role="region"
        aria-label="事件描述"
        className="journal-description min-h-12 flex-1 overflow-y-auto overscroll-contain text-sm leading-6 whitespace-pre-wrap text-walnut outline-offset-2"
      >
        {entry.body}
      </div>
      {photos.length > 0 && (
        <div className="journal-photos h-[min(234px,35dvh)] shrink-0 overflow-hidden rounded-[20px]">
          <MediaGallery
            fit="cover"
            photos={photos}
            index={current}
            onIndex={setIndex}
            keyboard={!lightbox && !editing && wide}
            onImageClick={() => setLightbox(true)}
          />
        </div>
      )}
      {canEdit && (
        <footer className="mt-2 flex h-12 shrink-0 items-center justify-end">
          <Button
            variant="ghost"
            size="base"
            className="journal-edit items-center justify-center"
            onClick={onEdit}
          >
            <Pencil size={14} />
            编辑记录
          </Button>
        </footer>
      )}
    </>
  )
  return (
    <>
      {wide ? (
        <section
          aria-labelledby="expanded-event-title"
          data-event-details=""
          style={{ left: `${20 + panelWidth + 16}px` }}
          className="journal-details absolute top-11 z-20 flex h-[460px] max-h-[calc(100dvh-88px)] w-[438px] flex-col gap-2.5 rounded-[20px] border border-ink-20 bg-soft-white px-[38px] pt-5 pb-3 shadow-periplus-soft"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !lightbox && !editing) {
              event.stopPropagation()
              onClose()
            }
          }}
        >
          {content}
        </section>
      ) : (
        <Modal
          title={eventTitle(entry)}
          hideTitle
          onClose={onClose}
          className="journal-read-mobile flex h-dvh! max-h-none! w-screen! max-w-none! flex-col gap-4 rounded-none! px-6! py-6! sm:h-[min(700px,calc(100dvh-48px))]! sm:w-[438px]! sm:rounded-[20px]!"
        >
          {() => content}
        </Modal>
      )}
      {lightbox && (
        <PhotoViewer
          photos={photos}
          initialIndex={current}
          onClose={() => setLightbox(false)}
        />
      )}
    </>
  )
}
