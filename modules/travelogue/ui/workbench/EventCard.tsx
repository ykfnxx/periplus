"use client"
import { useSortable } from "@dnd-kit/react/sortable"
import { motion, useReducedMotion } from "motion/react"
import { ArrowUpRight, Footprints } from "lucide-react"
import { Button } from "@/components/kumo/components/button/button"
import type { RecordingEvent } from "@/modules/data-model/contracts/recording"
import PhotoStrip from "./PhotoStrip"
import { eventTitle } from "../display"

export default function EventCard({
  entry,
  index,
  selected,
  canEdit,
  onSelect,
  onExpand,
}: {
  entry: RecordingEvent
  index: number
  selected: boolean
  canEdit: boolean
  onSelect: () => void
  onExpand: (index?: number) => void
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
  const title = eventTitle(entry)
  const transit = entry.category === "TRANSIT"
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
      animate={{
        opacity: isDragging ? 0.85 : 1,
        boxShadow: isDragging
          ? "0 12px 32px var(--color-ink-20)"
          : "0 0 0 transparent",
      }}
      className={`journal-card ${transit ? "journal-transit" : ""} relative scroll-mt-2 rounded-[20px] border bg-white outline-offset-4 ${transit ? "flex min-h-14 items-center justify-center px-12 py-3" : "p-4"} ${selected ? "border-russet shadow-periplus-soft" : "border-ink-20"} ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
    >
      {transit && (
        <span className="journal-transit-icon">
          <Footprints size={20} strokeWidth={1.75} />
        </span>
      )}
      <h2
        className={`min-w-0 text-base font-semibold ${transit ? "truncate text-center" : "pr-7"}`}
      >
        {title}
      </h2>
      <Button
        variant="ghost"
        shape="circle"
        size="xs"
        onPointerDown={(event) => event.stopPropagation()}
        aria-label={`展开${title}`}
        onClick={() => onExpand()}
        className="journal-expand absolute p-0!"
      >
        <ArrowUpRight size={17} strokeWidth={1.75} />
      </Button>
      {!transit && (
        <>
          {(entry.body || entry.photos.length > 0) && (
            <p
              className={`mt-2 line-clamp-2 text-sm leading-5 text-walnut ${entry.photos.length ? "min-h-10" : ""}`}
            >
              {entry.body}
            </p>
          )}
          {entry.photos.length > 0 && (
            <PhotoStrip photos={entry.photos} title={title} onOpen={onExpand} />
          )}
        </>
      )}
    </motion.article>
  )
}
