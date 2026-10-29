"use client"
import { useSortable } from "@dnd-kit/react/sortable"
import { motion, useReducedMotion } from "motion/react"
import {
  BedDouble,
  MapPin,
  NotebookPen,
  Pencil,
  TrainFront,
  Utensils,
  Activity,
} from "lucide-react"
import EventPlanning from "./EventPlanning"
import { eventCalendarDate } from "@/lib/journeys/calendar"
import { Button } from "@/components/kumo/components/button/button"
import type { JourneyEvent } from "@/modules/data-model/contracts"
import PhotoStrip from "./PhotoStrip"
import UserSource from "./UserSource"
import ReceiptCard from "./ReceiptCard"
import { dateLabel } from "../display"
import { receiptTotal } from "../receipt-display"
const icons = {
  VISIT: MapPin,
  MEAL: Utensils,
  STAY: BedDouble,
  ACTIVITY: Activity,
  TRANSIT: TrainFront,
}

export default function EventCard({
  entry,
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
  const labels = {
    VISIT: "游览",
    MEAL: "用餐",
    STAY: "住宿",
    ACTIVITY: "活动",
    TRANSIT: "交通",
  }
  const title =
    entry.title ||
    entry.location?.name ||
    (entry.category ? labels[entry.category] : "随记")
  const Icon = entry.category ? icons[entry.category] : NotebookPen
  const body = entry.body.trim()
  const preview = Array.from(body).slice(0, 120).join("")
  return (
    <motion.article
      ref={canMove ? ref : undefined}
      id={`record-${entry.id}`}
      data-record-id={entry.id}
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
      className={`journal-card relative scroll-mt-3 outline-offset-4 ${canMove ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
    >
      <header className="flex items-start gap-3">
        <Icon
          size={20}
          strokeWidth={1.6}
          className="mt-0.5 shrink-0 text-journal-accent"
        />
        <h2 className="min-w-0 flex-1 break-words">{title}</h2>
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
            <Pencil size={16} />
          </Button>
        )}
      </header>
      {entry.source && (
        <div className="mt-2 flex items-center gap-2 text-xs text-journal-muted">
          <UserSource user={entry.source} />
          {date && <span>· {dateLabel(date)}</span>}
        </div>
      )}
      {body && (
        <>
          <p className="line-clamp-3 break-words">
            {preview}
            {body.length > preview.length ? "…" : ""}
          </p>
        </>
      )}
      <Button
        variant="ghost"
        size="sm"
        className="mt-1 px-0! text-journal-muted!"
        aria-label={`展开${title}的详情`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={onRead}
      >
        展开详情
      </Button>
      <EventPlanning event={entry} />
      {entry.receipts?.map((receipt) => (
        <ReceiptCard
          key={receipt.assetId}
          merchant={receipt.merchant || ""}
          date={receipt.date ? dateLabel(receipt.date) : ""}
          total={receiptTotal(receipt)}
          onOpen={() => onReceipt(receipt.assetId)}
        />
      ))}
      {entry.photos.length > 0 && (
        <PhotoStrip photos={entry.photos} title={title} onOpen={onExpand} />
      )}
    </motion.article>
  )
}
