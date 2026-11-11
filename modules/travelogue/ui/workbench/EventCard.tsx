"use client"

import { useEffect, useRef, useState } from "react"
import { ContextMenu } from "@base-ui/react/context-menu"
import { useSortable } from "@dnd-kit/react/sortable"
import { motion, useReducedMotion } from "motion/react"
import {
  ArrowUpRight,
  Clock3,
  GripVertical,
  MapPin,
  Pencil,
  Trash2,
} from "lucide-react"
import type {
  JourneyEvent,
  EventWeather as Weather,
} from "@/modules/data-model/contracts"
import {
  eventCardTimes,
  eventCardTitle,
  eventCategoryLabels,
  eventTransitDisplay,
} from "../event-card-display"
import EventCover from "./EventCover"
import EventWeather from "./EventWeather"
import { ExpensePills, InlineReceiptBreakdown } from "./ReceiptCard"
import TransitEventCard from "./TransitEventCard"
import UserSource from "./UserSource"

export default function EventCard({
  entry,
  weather,
  index,
  selected,
  canEdit,
  canRemove,
  canMove,
  moveDisabled,
  onReceipt,
  onSelect,
  onExpand,
  onEdit,
  onRemove,
  onRead,
}: {
  entry: JourneyEvent
  weather?: Weather | null
  index: number
  selected: boolean
  canEdit: boolean
  canRemove: boolean
  canMove: boolean
  moveDisabled: boolean
  onReceipt: (assetId: string) => void
  onAddReceipt?: () => void
  onSelect: () => void
  onExpand: (index?: number) => void
  onEdit: () => void
  onRemove: () => void
  onRead: () => void
}) {
  const reduced = useReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  const [openReceiptId, setOpenReceiptId] = useState<string | null>(null)
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointer = useRef({ x: 0, y: 0 })
  function cancelHold() {
    if (hold.current) clearTimeout(hold.current)
    hold.current = null
  }
  useEffect(() => cancelHold, [])

  const transit = entry.category === "TRANSIT"
  const transitInfo = transit ? eventTransitDisplay(entry) : null
  const title = transit
    ? entry.transit
      ? `${entry.transit.fromName}到${entry.transit.toName}`
      : "交通"
    : eventCardTitle(entry)

  const { ref, handleRef, isDragging } = useSortable({
    id: entry.id,
    index,
    disabled: !canMove || moveDisabled,
    data: { title },
    transition: {
      duration: reduced ? 0 : 220,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      idle: false,
    },
  })

  const stamp = transit ? null : weather
  const horizontal = entry.category === "MEAL" || entry.category === "STAY"
  const body = entry.body.trim() || (transit ? entry.transit?.notes || "" : "")
  const times = eventCardTimes(entry)
  const hasCover =
    !transit &&
    Boolean(
      entry.photos.length ||
      entry.hotel?.coverImageUrl ||
      entry.planning?.coverImageUrl
    )
  const openReceipt =
    entry.receipts.find((item) => item.assetId === openReceiptId) ?? null
  const toggleReceipt = (assetId: string) =>
    setOpenReceiptId((current) => (current === assetId ? null : assetId))

  const sortHandle = canMove ? (
    <button
      type="button"
      ref={handleRef}
      className="journal-card-sort"
      disabled={moveDisabled}
      aria-label={`拖动调整${title}的顺序`}
      title="拖动调整顺序"
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <GripVertical size={15} aria-hidden="true" />
    </button>
  ) : null

  return (
    <ContextMenu.Root
      disabled={!canEdit && !canRemove}
      open={menuOpen}
      onOpenChange={setMenuOpen}
    >
      <ContextMenu.Trigger
        render={
          <motion.article animate={{ opacity: isDragging ? 0.65 : 1 }} />
        }
        ref={canMove ? ref : undefined}
        id={`record-${entry.id}`}
        data-record-id={entry.id}
        data-dragging={isDragging || undefined}
        data-event-category={entry.category || "VISIT"}
        tabIndex={0}
        aria-label={title}
        aria-current={selected ? "true" : undefined}
        onPointerDownCapture={(event) => {
          if (
            !event.currentTarget.contains(event.target as Node) ||
            event.pointerType !== "mouse" ||
            event.button !== 0 ||
            (!canEdit && !canRemove) ||
            (event.target as HTMLElement).closest(
              "button, a, input, [role=dialog]"
            )
          )
            return
          const target = event.currentTarget
          pointer.current = { x: event.clientX, y: event.clientY }
          hold.current = setTimeout(() => {
            target.dispatchEvent(
              new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: pointer.current.x,
                clientY: pointer.current.y,
              })
            )
          }, 550)
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
        onClickCapture={(event) => {
          if (menuOpen) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
        onClick={(event) => {
          if (
            event.currentTarget.contains(event.target as Node) &&
            !menuOpen &&
            !isDragging &&
            !(event.target as HTMLElement).closest("button, a, input")
          )
            onSelect()
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || isDragging) return
          if (event.key === "Enter") {
            event.preventDefault()
            onSelect()
          }
          if (
            event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10")
          ) {
            event.preventDefault()
            const box = event.currentTarget.getBoundingClientRect()
            event.currentTarget.dispatchEvent(
              new MouseEvent("contextmenu", {
                bubbles: true,
                clientX: box.x + box.width / 2,
                clientY: box.y + 40,
              })
            )
          }
        }}
        className={`journal-card ${transit ? "journal-card-transit" : horizontal ? "journal-card-horizontal" : "journal-card-portrait"} relative scroll-mt-3 outline-offset-4 ${canMove && !moveDisabled ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
      >
        {hasCover && (
          <EventCover event={entry} title={title} onOpen={onExpand} />
        )}
        <div className="journal-card-content">
          {transit ? (
            <>
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <span className="journal-transit-badge">
                  {[transitInfo?.mode, transitInfo?.line]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <div className="flex shrink-0 items-center gap-0.5 text-journal-transit-muted">
                  {sortHandle}
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`编辑${title}`}
                      title="编辑"
                      className="inline-flex size-7 items-center justify-center rounded-lg hover:bg-journal-transit-chip hover:text-journal-transit-ink"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        onEdit()
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`展开${title}的详情`}
                    title="展开"
                    className="inline-flex size-7 items-center justify-center rounded-lg hover:bg-journal-transit-chip hover:text-journal-transit-ink"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      onRead()
                    }}
                  >
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              </div>
              <TransitEventCard event={entry} />
              {(body || entry.receipts.length > 0) && (
                <div className="journal-transit-bottom">
                  {body && (
                    <span className="journal-transit-note" title={body}>
                      {body}
                    </span>
                  )}
                  <ExpensePills
                    receipts={entry.receipts}
                    activeAssetId={openReceiptId}
                    onToggle={toggleReceipt}
                    variant="transit"
                  />
                </div>
              )}
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
              {(entry.location || times.range || stamp) && (
                <div className="journal-card-meta">
                  {entry.location && (
                    <span className="inline-flex min-w-0 items-center gap-1 font-medium text-journal-amber">
                      <MapPin size={12} className="shrink-0" />
                      <span className="truncate">{entry.location.name}</span>
                    </span>
                  )}
                  {times.range && (
                    <span className="journal-card-time">
                      <Clock3 size={12} aria-hidden="true" />
                      {times.range}
                    </span>
                  )}
                  <EventWeather weather={stamp} />
                </div>
              )}
              <div className="journal-card-topline">
                <h2 className="journal-event-title min-w-0 flex-1">
                  <button
                    type="button"
                    aria-label={`展开${title}的详情`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onRead()
                    }}
                  >
                    {title}
                  </button>
                </h2>
                <div className="flex shrink-0 items-center gap-0.5 text-journal-muted">
                  {canEdit && (
                    <button
                      type="button"
                      aria-label={`编辑${title}`}
                      title="编辑"
                      className="inline-flex size-7 items-center justify-center rounded-lg hover:bg-journal-paper-soft hover:text-journal-ink"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        onEdit()
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`查看${title}详情`}
                    title="展开"
                    className="inline-flex size-7 items-center justify-center rounded-lg hover:bg-journal-paper-soft hover:text-journal-ink"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation()
                      onRead()
                    }}
                  >
                    <ArrowUpRight size={15} />
                  </button>
                </div>
              </div>
              {body && <p className="journal-card-body">{body}</p>}
              <div className="cards-footer">
                <span className="journal-category-chip">
                  {eventCategoryLabels[entry.category]}
                </span>
                <UserSource user={entry.source} compact />
                {sortHandle}
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
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner
          sideOffset={6}
          collisionPadding={12}
          className="z-50"
        >
          <ContextMenu.Popup className="min-w-36 rounded-xl border border-journal-line bg-journal-card p-1.5 text-sm shadow-journal outline-none">
            {canEdit && (
              <ContextMenu.Item
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 outline-none data-highlighted:bg-journal-paper-soft"
                onClick={onEdit}
              >
                <Pencil size={15} />
                编辑
              </ContextMenu.Item>
            )}
            {canRemove && (
              <ContextMenu.Item
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-coral outline-none data-highlighted:bg-journal-paper-soft"
                onClick={onRemove}
              >
                <Trash2 size={15} />
                删除
              </ContextMenu.Item>
            )}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}
