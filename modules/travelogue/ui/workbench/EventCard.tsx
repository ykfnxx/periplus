"use client"
import { useSortable } from "@dnd-kit/react/sortable"
import { motion, useReducedMotion } from "motion/react"
import { ChevronRight, MapPin, Pencil } from "lucide-react"
import { eventCalendarDate } from "@/lib/journeys/calendar"
import { Button } from "@/components/kumo/components/button/button"
import type { JourneyEvent } from "@/modules/data-model/contracts"
import UserSource from "./UserSource"
import ReceiptCard from "./ReceiptCard"
import EventCover from "./EventCover"
import TransitEventCard from "./TransitEventCard"
import { dateLabel } from "../display"
import { receiptTotal } from "../receipt-display"
import {
  eventCardTimes,
  eventCardTitle,
  eventCategoryLabels,
  eventCity,
} from "../event-card-display"

export default function EventCard({
  entry,
  eventsById,
  index,
  selected,
  canEdit,
  canMove,
  onReceipt,
  onSelect,
  onExpand,
  onEdit,
  onRead,
}: {
  entry: JourneyEvent
  eventsById: ReadonlyMap<string, JourneyEvent>
  index: number
  selected: boolean
  canEdit: boolean
  canMove: boolean
  onReceipt: (assetId: string) => void
  onSelect: () => void
  onExpand: (index?: number) => void
  onEdit: () => void
  onRead: () => void
}) {
  const date = eventCalendarDate(entry)
  const reduced = useReducedMotion()
  const { ref, isDragging } = useSortable({
    id: entry.id,
    index,
    disabled: !canMove,
    transition: {
      duration: reduced ? 0 : 220,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      idle: false,
    },
  })
  const title = eventCardTitle(entry)
  const city = eventCity(entry)
  const body = entry.body.trim()
  const transit = entry.category === "TRANSIT"
  const origin = entry.transit && eventsById.get(entry.transit.fromEventId)
  const destination = entry.transit && eventsById.get(entry.transit.toEventId)
  const preview = Array.from(
    body || (transit ? entry.transit?.notes || "" : "")
  )
    .slice(0, 120)
    .join("")
  const times = eventCardTimes(entry)
  const hasCover =
    !transit &&
    Boolean(
      entry.photos.length ||
      entry.hotel?.coverImageUrl ||
      entry.planning?.coverImageUrl
    )
  return (
    <motion.article
      ref={canMove ? ref : undefined}
      id={`record-${entry.id}`}
      data-record-id={entry.id}
      data-event-category={entry.category || "NOTE"}
      tabIndex={0}
      aria-label={title}
      aria-current={selected ? "true" : undefined}
      onClick={(event) => {
        if (!isDragging && !(event.target as HTMLElement).closest("button"))
          onSelect()
      }}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          event.key === "Enter" &&
          !isDragging
        ) {
          event.preventDefault()
          onSelect()
        }
      }}
      animate={{ opacity: isDragging ? 0.7 : 1 }}
      className={`journal-card ${transit ? "journal-card-transit" : ""} relative scroll-mt-3 outline-offset-4 ${canMove ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
    >
      {hasCover && <EventCover event={entry} title={title} onOpen={onExpand} />}
      <div
        className={`journal-card-content ${hasCover ? "journal-card-content-cover" : ""}`}
      >
        {!transit && city && (
          <div className="journal-card-city">
            <MapPin size={14} strokeWidth={1.8} aria-hidden="true" />
            <span>{city}</span>
          </div>
        )}
        <header
          className={`journal-card-heading flex items-start gap-2 ${transit && origin && destination ? "journal-transit-actions" : ""}`}
        >
          <h2
            className={`min-w-0 flex-1 break-words ${transit && origin && destination ? "sr-only" : ""}`}
          >
            {title}
          </h2>
          {canEdit && (
            <Button
              variant="ghost"
              shape="square"
              size="sm"
              className="journal-event-edit shrink-0"
              aria-label={`编辑${title}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={onEdit}
            >
              <Pencil size={15} />
            </Button>
          )}
          <Button
            variant="ghost"
            shape="square"
            size="sm"
            className="journal-card-read shrink-0"
            aria-label={`展开${title}的详情`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onRead}
          >
            <ChevronRight size={16} />
          </Button>
        </header>
        <div className="journal-card-meta flex flex-wrap items-center gap-x-2 gap-y-1">
          <UserSource user={entry.source} />
          {date && <span>· {dateLabel(date)}</span>}
          {!transit && times.range && (
            <span className="font-mono">{times.range}</span>
          )}
        </div>
        {transit && (
          <TransitEventCard
            event={entry}
            origin={origin}
            destination={destination}
          />
        )}
        <div
          className={
            transit && (preview || entry.receipts.length)
              ? "journal-transit-footer"
              : undefined
          }
        >
          {preview && (
            <p className={transit ? "line-clamp-1" : "line-clamp-3"}>
              {preview}
              {body.length > preview.length ? "…" : ""}
            </p>
          )}
          {entry.receipts.map((receipt) => (
            <ReceiptCard
              key={receipt.assetId}
              compact
              merchant={receipt.merchant || ""}
              date={receipt.date ? dateLabel(receipt.date) : ""}
              total={
                receipt.currency === "CNY" && receipt.total !== null
                  ? `¥${receipt.total}`
                  : receiptTotal(receipt)
              }
              onOpen={() => onReceipt(receipt.assetId)}
            />
          ))}
        </div>
        {!transit && (entry.category || entry.cuisine) && (
          <div className="journal-card-tags">
            {entry.category && (
              <span>{eventCategoryLabels[entry.category]}</span>
            )}
            {entry.cuisine && <span>{entry.cuisine}</span>}
          </div>
        )}
      </div>
    </motion.article>
  )
}
