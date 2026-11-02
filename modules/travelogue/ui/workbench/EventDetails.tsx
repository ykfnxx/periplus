"use client"

import { useEffect, useRef, useState } from "react"
import { CalendarDays, MapPin, X, Camera, ReceiptText } from "lucide-react"
import EventPlanning from "./EventPlanning"
import EventCover from "./EventCover"
import { eventCalendarDate } from "@/lib/journeys/calendar"
import { Button } from "@/components/kumo/components/button/button"
import type { JourneyEvent } from "@/modules/data-model/contracts"
import { dateLabel, eventTitle } from "../display"
import { eventCategoryLabels } from "../event-card-display"
import { photoItems } from "../photo-items"
import { Modal } from "./Modal"
import PhotoStrip from "./PhotoStrip"
import PhotoViewer from "./PhotoViewer"
import UserSource from "./UserSource"
import ReceiptCard from "./ReceiptCard"
import { receiptTotal } from "../receipt-display"

export default function EventDetails({
  entry,
  onClose,
  onReceipt,
  onAddPhotos,
  onAddReceipt,
  panel = false,
}: {
  entry: JourneyEvent
  panel?: boolean
  onClose: () => void
  onReceipt: (assetId: string) => void
  onAddPhotos?: () => void
  onAddReceipt?: () => void
}) {
  const [photoIndex, setPhotoIndex] = useState<number | null>(null)
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (panel)
      panelRef.current
        ?.querySelector<HTMLButtonElement>('[aria-label="关闭详情"]')
        ?.focus({ preventScroll: true })
  }, [panel])
  const title = eventTitle(entry)
  const date = eventCalendarDate(entry)
  const content = (close: () => void) => (
    <>
      {panel && (
        <EventCover event={entry} title={title} onOpen={setPhotoIndex} />
      )}
      <header
        className={`z-10 flex min-h-16 items-center gap-3 px-6 py-3 md:px-9 ${panel ? "journal-timeline-detail-heading" : "sticky top-0 bg-white"}`}
      >
        <h2 className="min-w-0 flex-1 text-lg font-semibold break-words">
          {title}
        </h2>

        <Button
          variant="ghost"
          shape="square"
          aria-label="关闭详情"
          className="shrink-0"
          onClick={close}
        >
          <X size={20} />
        </Button>
      </header>
      <div className="px-6 pb-8 md:px-9">
        {!panel && entry.source && (
          <div className="mb-4">
            <UserSource user={entry.source} className="text-journal-muted" />
          </div>
        )}
        {(date || entry.location) && (
          <div className="mb-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-journal-muted">
            {date && (
              <span className="flex items-center gap-2">
                <CalendarDays size={16} />
                {dateLabel(date!)}
              </span>
            )}
            {entry.location && (
              <span className="flex min-w-0 items-center gap-2">
                <MapPin size={16} className="shrink-0" />
                <span className="break-words">{entry.location.name}</span>
              </span>
            )}
          </div>
        )}
        {entry.body && (
          <p className="text-base leading-[26px] break-words whitespace-pre-wrap text-journal-ink">
            {entry.body}
          </p>
        )}
        <EventPlanning event={entry} expanded />
        {entry.receipts?.map((receipt) => (
          <ReceiptCard
            key={receipt.assetId}
            compact={panel}
            merchant={receipt.merchant || ""}
            date={receipt.date ? dateLabel(receipt.date) : ""}
            total={
              panel && receipt.currency === "CNY" && receipt.total !== null
                ? `¥${receipt.total}`
                : receiptTotal(receipt)
            }
            onOpen={() => onReceipt(receipt.assetId)}
          />
        ))}
        {!panel && entry.photos.length > 0 && (
          <PhotoStrip
            photos={entry.photos}
            title={title}
            onOpen={setPhotoIndex}
          />
        )}
        {panel && (
          <>
            <div className="journal-card-tags">
              <span>{eventCategoryLabels[entry.category]}</span>
            </div>
            <div className="mt-3">
              <UserSource user={entry.source} className="text-journal-muted" />
            </div>
          </>
        )}
        {(onAddPhotos || onAddReceipt) && (
          <div className="mt-5 flex flex-wrap gap-2">
            {onAddPhotos && (
              <Button variant="secondary" onClick={onAddPhotos}>
                <Camera size={16} />
                补照片
              </Button>
            )}
            {onAddReceipt && (
              <Button variant="ghost" onClick={onAddReceipt}>
                <ReceiptText size={16} />
                加账单
              </Button>
            )}
          </div>
        )}
      </div>
      {photoIndex !== null && (
        <PhotoViewer
          photos={photoItems([entry])}
          initialIndex={photoIndex}
          onClose={() => setPhotoIndex(null)}
        />
      )}
    </>
  )
  if (panel)
    return (
      <section
        ref={panelRef}
        className="journal-event-details journal-timeline-detail"
        aria-label={`${title}的详情`}
        onKeyDown={(event) => {
          // Portalled photo/bill dialogs own Escape; only dismiss from this panel.
          if (
            event.key === "Escape" &&
            !event.defaultPrevented &&
            event.currentTarget.contains(event.target as Node)
          ) {
            event.stopPropagation()
            onClose()
          }
        }}
      >
        {content(onClose)}
      </section>
    )
  return (
    <Modal
      title={title}
      hideTitle
      hideClose
      onClose={onClose}
      className="journal-event-details w-[640px]! p-0! max-sm:top-0! max-sm:left-0! max-sm:h-dvh! max-sm:max-h-dvh! max-sm:w-screen! max-sm:max-w-none! max-sm:translate-none! max-sm:transform-none! max-sm:rounded-none! max-sm:pt-[env(safe-area-inset-top)]! max-sm:pb-[env(safe-area-inset-bottom)]!"
    >
      {content}
    </Modal>
  )
}
