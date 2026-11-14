"use client"

import { useEffect, useRef, useState } from "react"
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pencil,
  ReceiptText,
  X,
} from "lucide-react"
import { eventCalendarDate } from "@/lib/journeys/calendar"
import { Button } from "@/components/kumo/components/button/button"
import type {
  JourneyEvent,
  EventWeather as Weather,
} from "@/modules/data-model/contracts/index"
import { dateLabel, eventTitle } from "../formatting/display"
import {
  eventCardTimes,
  eventCategoryLabels,
  eventTransitDisplay,
} from "../../model/event-card-display"
import { photoItems } from "../photos/photo-items"
import EventPlanning from "./EventPlanning"
import EventWeather from "./EventWeather"
import PhotoViewer from "../photos/PhotoViewer"
import { ProviderImage } from "../photos/ProviderImage"
import { ExpensePills, InlineReceiptBreakdown } from "../receipts/ReceiptCard"
import TransitEventCard from "./TransitEventCard"
import UserSource from "../workbench/UserSource"

export default function EventDetails({
  entry,
  weather,
  onClose,
  onReceipt,
  onEdit,
  onAddPhotos,
  onAddReceipt,
  currentIndex,
  totalCount,
  onPrev,
  onNext,
  panel = false,
  embedded = false,
}: {
  entry: JourneyEvent
  weather?: Weather | null
  panel?: boolean
  embedded?: boolean
  currentIndex?: number
  totalCount?: number
  onPrev?: () => void
  onNext?: () => void
  onClose: () => void
  onReceipt: (assetId: string) => void
  onEdit?: () => void
  onAddPhotos?: () => void
  onAddReceipt?: () => void
}) {
  const [photoIndex, setPhotoIndex] = useState<number | null>(null)
  const [openReceiptId, setOpenReceiptId] = useState<string | null>(null)
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!embedded)
      panelRef.current
        ?.querySelector<HTMLButtonElement>('[aria-label="关闭详情"]')
        ?.focus({ preventScroll: true })
  }, [entry.id, embedded])

  const transit = entry.category === "TRANSIT"
  const transitInfo = transit ? eventTransitDisplay(entry) : null
  const title = transit
    ? entry.transit
      ? `${entry.transit.fromName}到${entry.transit.toName}`
      : "交通"
    : eventTitle(entry)
  const date = eventCalendarDate(entry)
  const stamp = transit ? null : weather
  const times = eventCardTimes(entry)
  const body = entry.body.trim() || (transit ? entry.transit?.notes || "" : "")
  const providerCover =
    entry.hotel?.coverImageUrl ?? entry.planning?.coverImageUrl
  const openReceipt =
    entry.receipts.find((item) => item.assetId === openReceiptId) ?? null
  const toggleReceipt = (assetId: string) =>
    setOpenReceiptId((current) => (current === assetId ? null : assetId))

  const photoGrid =
    entry.photos.length > 0 ? (
      <div
        className={`mt-4 grid gap-2 ${
          entry.photos.length === 1 ? "grid-cols-1" : "grid-cols-2"
        }`}
      >
        {entry.photos.map((photo, index) => (
          <button
            key={photo.assetId}
            type="button"
            aria-label={`查看照片 ${index + 1}`}
            className={`overflow-hidden rounded-2xl border border-journal-line bg-journal-card ${
              entry.photos.length === 1 ? "aspect-[16/10]" : "aspect-[4/3]"
            }`}
            onClick={() => setPhotoIndex(index)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.url}
              alt={`旅行照片 ${index + 1}`}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
    ) : !transit && providerCover ? (
      <div className="mt-4 aspect-[16/10] overflow-hidden rounded-2xl border border-journal-line bg-journal-card">
        <ProviderImage
          src={providerCover}
          alt={title}
          category={entry.hotel ? "HOTEL" : "SIGHT"}
          width={640}
          height={400}
          className="h-full w-full object-cover"
        />
      </div>
    ) : null

  return (
    <section
      ref={panelRef}
      aria-label={`${title}的详情`}
      className={
        panel
          ? embedded
            ? "journal-event-details journal-timeline-detail journal-curtain-detail"
            : "journal-event-details journal-timeline-detail"
          : "journal-subpage journal-event-details"
      }
      onKeyDown={(event) => {
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
      {!embedded && (
        <header className="journal-subpage-header sticky top-0 z-10">
          <Button
            variant="ghost"
            shape="square"
            aria-label="关闭详情"
            onClick={onClose}
          >
            {panel ? <X size={18} /> : <ArrowLeft size={17} />}
          </Button>
          <div className="flex items-center gap-1">
            {onAddReceipt && (
              <Button
                variant="ghost"
                shape="square"
                aria-label="加账单"
                title="加账单"
                onClick={onAddReceipt}
              >
                <ReceiptText size={16} />
              </Button>
            )}
            {onAddPhotos && (
              <Button
                variant="ghost"
                shape="square"
                aria-label="整理照片"
                title="整理照片"
                onClick={onAddPhotos}
              >
                <Camera size={16} />
              </Button>
            )}
            {onEdit && (
              <Button
                variant="ghost"
                shape="square"
                aria-label="编辑记录"
                title="编辑记录"
                onClick={onEdit}
              >
                <Pencil size={16} />
              </Button>
            )}
          </div>
        </header>
      )}

      <div className="journal-subpage-body">
        <div className="rounded-3xl border border-journal-line bg-journal-card p-5 shadow-journal-card">
          {transit ? (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-journal-muted">
                <UserSource user={entry.source} compact />
                {date && (
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <CalendarDays size={13} />
                    {dateLabel(date)}
                  </span>
                )}
              </div>
              <div className="mt-3 rounded-2xl border border-journal-transit-line bg-journal-transit p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="journal-transit-badge">
                    {[transitInfo?.mode, transitInfo?.line]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {(transitInfo?.duration || transitInfo?.distance) && (
                    <span className="text-xs font-medium text-journal-transit-muted tabular-nums">
                      {[transitInfo?.duration, transitInfo?.distance]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </div>
                <TransitEventCard event={entry} />
                {(entry.transit?.fromLocation?.city ||
                  entry.transit?.toLocation?.city) && (
                  <div className="mt-1.5 flex items-center justify-between text-xs text-journal-transit-muted">
                    <span>{entry.transit?.fromLocation?.city || ""}</span>
                    <span>{entry.transit?.toLocation?.city || ""}</span>
                  </div>
                )}
              </div>
              {photoGrid}
              {body && (
                <p className="mt-4 text-[14.5px] leading-7 break-words whitespace-pre-wrap text-journal-ink">
                  {body}
                </p>
              )}
              <div className="cards-footer mt-4 border-t border-journal-line pt-3">
                <span className="journal-category-chip">交通</span>
                <ExpensePills
                  receipts={entry.receipts}
                  activeAssetId={openReceiptId}
                  onToggle={toggleReceipt}
                  variant="transit"
                />
              </div>
              {openReceipt && (
                <InlineReceiptBreakdown
                  receipt={openReceipt}
                  variant="transit"
                  onOpenDetails={() => onReceipt(openReceipt.assetId)}
                />
              )}
            </>
          ) : (
            <>
              {entry.location && (
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-journal-amber">
                  <MapPin size={13} className="shrink-0" />
                  <span className="break-words">{entry.location.name}</span>
                </div>
              )}
              <h2 className="font-editorial text-2xl leading-8 font-bold break-words text-journal-ink">
                {title}
              </h2>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-journal-muted">
                <UserSource user={entry.source} compact />
                {date && (
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <CalendarDays size={13} />
                    {dateLabel(date)}
                    {times.range ? ` · ${times.range}` : ""}
                  </span>
                )}
                <EventWeather weather={stamp} />
              </div>
              {photoGrid}
              {body && (
                <p className="mt-4 text-[14.5px] leading-7 break-words whitespace-pre-wrap text-journal-ink">
                  {body}
                </p>
              )}
              <EventPlanning event={entry} />
              <div className="cards-footer mt-4 border-t border-journal-line pt-3">
                <span className="journal-category-chip">
                  {eventCategoryLabels[entry.category]}
                </span>
                <ExpensePills
                  receipts={entry.receipts}
                  activeAssetId={openReceiptId}
                  onToggle={toggleReceipt}
                />
              </div>
              {openReceipt && (
                <InlineReceiptBreakdown
                  receipt={openReceipt}
                  onOpenDetails={() => onReceipt(openReceipt.assetId)}
                />
              )}
            </>
          )}
        </div>
      </div>

      {!panel && totalCount !== undefined && totalCount > 1 && (
        <footer className="flex shrink-0 items-center justify-between border-t border-journal-canvas-line bg-journal-canvas px-4 py-2.5">
          <Button
            variant="ghost"
            size="sm"
            disabled={!onPrev}
            onClick={onPrev}
            aria-label="上一条记录"
          >
            <ChevronLeft size={15} />
            上一条
          </Button>
          <span className="text-xs text-journal-muted tabular-nums">
            {(currentIndex ?? 0) + 1} / {totalCount}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!onNext}
            onClick={onNext}
            aria-label="下一条记录"
          >
            下一条
            <ChevronRight size={15} />
          </Button>
        </footer>
      )}

      {photoIndex !== null && (
        <PhotoViewer
          photos={photoItems([entry])}
          initialIndex={photoIndex}
          onClose={() => setPhotoIndex(null)}
        />
      )}
    </section>
  )
}
