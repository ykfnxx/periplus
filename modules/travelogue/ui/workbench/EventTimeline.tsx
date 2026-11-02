"use client"

import { useEffect, useRef, useState } from "react"
import { ContextMenu } from "@base-ui/react/context-menu"
import { motion, useReducedMotion } from "motion/react"
import {
  BedDouble,
  MapPin,
  Pencil,
  TrainFront,
  Trash2,
  Utensils,
} from "lucide-react"
import type { JourneyEvent } from "@/modules/data-model/contracts"
import { dateLabel, eventTitle } from "../display"
import { eventCardTimes, eventCategoryLabels } from "../event-card-display"

const categoryIcons = {
  VISIT: MapPin,
  MEAL: Utensils,
  STAY: BedDouble,
  TRANSIT: TrainFront,
}
const ticks = Array.from({ length: 25 }, (_, index) => {
  const x = 24 + index * 31.75
  const y = 18 + 30 * ((x - 405) / 381) ** 2
  return { x, y, length: index === 12 ? 14 : index % 3 === 0 ? 11 : 6 }
})

export default function EventTimeline({
  events,
  selectedId,
  compact,
  canEdit,
  loading,
  onSelect,
  onOpen,
  onEdit,
  onRemove,
}: {
  events: JourneyEvent[]
  selectedId: string | null
  compact: boolean
  canEdit: boolean
  loading: boolean
  onSelect: (id: string) => void
  onOpen: (event: JourneyEvent) => void
  onEdit: (event: JourneyEvent) => void
  onRemove: (event: JourneyEvent) => void
}) {
  const root = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const [hovered, setHovered] = useState<string | null>(null)
  const index = Math.max(
    0,
    events.findIndex((event) => event.id === selectedId)
  )
  const current = events[index]
  const spacing = compact ? 70 : 101
  const wheel = useRef({ delta: 0, time: 0 })

  useEffect(() => {
    const element = root.current
    if (!element || !events.length) return
    // Only the rail consumes the wheel; scrolling over the map keeps map zoom.
    const move = (event: WheelEvent) => {
      if (event.ctrlKey) return
      event.preventDefault()
      const now = performance.now()
      const delta =
        Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY
      if (now - wheel.current.time > 180) wheel.current.delta = 0
      wheel.current.delta +=
        delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 200 : 1)
      wheel.current.time = now
      if (Math.abs(wheel.current.delta) < 70) return
      const next = Math.max(
        0,
        Math.min(events.length - 1, index + Math.sign(wheel.current.delta))
      )
      wheel.current.delta = 0
      if (next !== index) onSelect(events[next].id)
    }
    element.addEventListener("wheel", move, { passive: false })
    return () => element.removeEventListener("wheel", move)
  }, [events, index, onSelect])

  return (
    <nav
      ref={root}
      className="journal-timeline"
      aria-label="事件时间轴"
      aria-busy={loading}
      onKeyDown={(event) => {
        if (
          event.defaultPrevented ||
          !event.currentTarget.contains(event.target as Node)
        )
          return
        const next =
          event.key === "ArrowRight"
            ? index + 1
            : event.key === "ArrowLeft"
              ? index - 1
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? events.length - 1
                  : null
        if (next === null || !events.length) return
        event.preventDefault()
        const entry = events[Math.max(0, Math.min(events.length - 1, next))]
        onSelect(entry.id)
        requestAnimationFrame(() =>
          document
            .getElementById(`timeline-${entry.id}`)
            ?.focus({ preventScroll: true })
        )
      }}
    >
      <div className="journal-timeline-glass" aria-hidden="true" />
      {current ? (
        <>
          <motion.div
            className="journal-timeline-track"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={reduced ? 0 : 0.3}
            onDragStart={() => setHovered(null)}
            onDragEnd={(_, info) => {
              const distance = info.offset.x + info.velocity.x * 0.08
              if (Math.abs(distance) < 25) return
              const steps =
                Math.sign(distance) *
                Math.max(1, Math.round(Math.abs(distance) / spacing))
              const next = Math.max(
                0,
                Math.min(events.length - 1, index - steps)
              )
              if (next !== index) onSelect(events[next].id)
            }}
            onPointerLeave={() => setHovered(null)}
          >
            {events
              .slice(Math.max(0, index - 5), index + 6)
              .map((entry, offset) => {
                const delta = Math.max(0, index - 5) + offset - index
                const selected = entry.id === current.id
                const hoverDelta = hovered
                  ? events.findIndex((event) => event.id === hovered) - index
                  : 0
                const hoverBoost =
                  hovered && !selected
                    ? Math.max(0, 1 - Math.abs(delta - hoverDelta) * 0.45) *
                      0.16
                    : 0
                const scale =
                  (selected
                    ? 1
                    : Math.max(0.56, 0.8 - Math.abs(delta) * 0.07)) + hoverBoost
                return (
                  <TimelineItem
                    key={entry.id}
                    entry={entry}
                    selected={selected}
                    canEdit={canEdit && entry.canEdit}
                    canRemove={canEdit && entry.canRemove}
                    onOpen={() => {
                      onSelect(entry.id)
                      onOpen(entry)
                    }}
                    onEdit={() => {
                      onSelect(entry.id)
                      onEdit(entry)
                    }}
                    onRemove={() => onRemove(entry)}
                    onHover={() => setHovered(entry.id)}
                    animation={{
                      x: delta * spacing,
                      y: Math.min(
                        60,
                        Math.abs(delta) ** 1.6 * (compact ? 5 : 7)
                      ),
                      rotate: delta * 4,
                      scale,
                      opacity: Math.abs(delta) > (compact ? 2 : 3) ? 0 : 1,
                    }}
                    duration={reduced ? 0 : 0.24}
                  />
                )
              })}
          </motion.div>
          <svg
            className="journal-timeline-ruler"
            viewBox="0 0 810 68"
            fill="none"
            aria-hidden="true"
          >
            <path d="M24 48 Q405 -12 786 48" />
            {ticks.map(({ x, y, length }, index) => (
              <path
                key={index}
                d={`M${x} ${y} l${(405 - x) / 180} ${length}`}
              />
            ))}
          </svg>
          <div
            className="journal-timeline-date"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="sr-only">{eventTitle(current)}，</span>
            {eventCardTimes(current).departure && (
              <span className="journal-timeline-time">
                {eventCardTimes(current).departure}
              </span>
            )}
            <time dateTime={current.date}>{dateLabel(current.date)}</time>
          </div>
        </>
      ) : (
        <p className="journal-timeline-empty">
          {loading ? "正在读取记录…" : "还没有记录"}
        </p>
      )}
    </nav>
  )
}

function TimelineItem({
  entry,
  selected,
  canEdit,
  canRemove,
  animation,
  duration,
  onOpen,
  onEdit,
  onRemove,
  onHover,
}: {
  entry: JourneyEvent
  selected: boolean
  canEdit: boolean
  canRemove: boolean
  animation: {
    x: number
    y: number
    scale: number
    rotate: number
    opacity: number
  }
  duration: number
  onOpen: () => void
  onEdit: () => void
  onRemove: () => void
  onHover: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const cancelHold = () => {
    if (hold.current) clearTimeout(hold.current)
    hold.current = null
  }
  useEffect(
    () => () => {
      if (hold.current) clearTimeout(hold.current)
    },
    []
  )
  const Icon = categoryIcons[entry.category]
  // A timeline slot is one event; use its first photo, never a separate photo list.
  const photo = entry.photos[0]
  return (
    <ContextMenu.Root
      disabled={!canEdit && !canRemove}
      open={menuOpen}
      onOpenChange={setMenuOpen}
    >
      <ContextMenu.Trigger
        render={
          <motion.button
            type="button"
            initial={false}
            animate={animation}
            transition={{ duration }}
          />
        }
        id={`timeline-${entry.id}`}
        className="journal-timeline-item"
        style={{
          pointerEvents: animation.opacity ? "auto" : "none",
          zIndex: selected ? 10 : 5 - Math.abs(animation.rotate) / 4,
        }}
        tabIndex={selected ? 0 : -1}
        aria-hidden={animation.opacity === 0 || undefined}
        aria-label={`${eventCategoryLabels[entry.category]}：${eventTitle(entry)}`}
        aria-current={selected ? "step" : undefined}
        title={eventTitle(entry)}
        onKeyDown={(event) => {
          if (
            (!canEdit && !canRemove) ||
            !(
              event.key === "ContextMenu" ||
              (event.shiftKey && event.key === "F10")
            )
          )
            return
          event.preventDefault()
          const box = event.currentTarget.getBoundingClientRect()
          event.currentTarget.dispatchEvent(
            new MouseEvent("contextmenu", {
              bubbles: true,
              clientX: box.x + box.width / 2,
              clientY: box.y + box.height / 2,
            })
          )
        }}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") onHover()
        }}
        onPointerDownCapture={(event) => {
          if (
            event.pointerType !== "mouse" ||
            event.button !== 0 ||
            (!canEdit && !canRemove)
          )
            return
          pointer.current = { x: event.clientX, y: event.clientY }
          const target = event.currentTarget
          hold.current = setTimeout(
            () =>
              target.dispatchEvent(
                new MouseEvent("contextmenu", {
                  bubbles: true,
                  clientX: pointer.current.x,
                  clientY: pointer.current.y,
                })
              ),
            550
          )
        }}
        onPointerMove={(event) => {
          if (
            Math.abs(event.clientX - pointer.current.x) > 10 ||
            Math.abs(event.clientY - pointer.current.y) > 10
          )
            cancelHold()
        }}
        onPointerUp={cancelHold}
        onPointerCancel={cancelHold}
        onPointerLeave={cancelHold}
        onClick={(event) => {
          if (menuOpen) {
            event.preventDefault()
            return
          }
          onOpen()
        }}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.url} alt="" draggable={false} />
        ) : (
          <Icon aria-hidden="true" strokeWidth={1.6} />
        )}
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner
          side="top"
          sideOffset={8}
          collisionPadding={12}
          className="z-50"
        >
          <ContextMenu.Popup className="min-w-36 rounded-xl border border-journal-paper-line bg-journal-paper p-1.5 text-sm shadow-journal outline-none">
            {canEdit && (
              <ContextMenu.Item
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 outline-none data-highlighted:bg-journal-paper-soft"
                onClick={onEdit}
              >
                <Pencil size={16} />
                编辑
              </ContextMenu.Item>
            )}
            {canRemove && (
              <ContextMenu.Item
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-coral outline-none data-highlighted:bg-journal-paper-soft"
                onClick={onRemove}
              >
                <Trash2 size={16} />
                删除
              </ContextMenu.Item>
            )}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
