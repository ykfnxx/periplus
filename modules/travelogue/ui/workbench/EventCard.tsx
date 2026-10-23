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
import { Button } from "@/components/kumo/components/button/button"
import type { RecordingEvent } from "@/modules/data-model/contracts/recording"
import PhotoStrip from "./PhotoStrip"
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
  onSelect,
  onExpand,
  onEdit,
}: {
  entry: RecordingEvent
  index: number
  selected: boolean
  canEdit: boolean
  onSelect: () => void
  onExpand: (index?: number) => void
  onEdit: () => void
}) {
  const reduced = useReducedMotion()
  const { ref, isDragging } = useSortable({
    id: entry.id,
    index,
    disabled: !canEdit,
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
  return (
    <motion.article
      ref={canEdit ? ref : undefined}
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
      className={`journal-card relative scroll-mt-3 outline-offset-4 ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
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
      {entry.body && (
        <p className="break-words whitespace-pre-wrap">{entry.body}</p>
      )}
      {entry.photos.length > 0 && (
        <PhotoStrip photos={entry.photos} title={title} onOpen={onExpand} />
      )}
    </motion.article>
  )
}
