"use client"
import { useEffect, useRef, useState } from "react"
import { ContextMenu } from "@base-ui/react/context-menu"
import { useSortable } from "@dnd-kit/react/sortable"
import { motion, useReducedMotion } from "motion/react"
import { Clock3, Pencil, Trash2 } from "lucide-react"
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
  index,
  selected,
  canEdit,
  canRemove,
  canMove,
  onReceipt,
  onSelect,
  onExpand,
  onEdit,
  onRemove,
  onRead,
}: {
  entry: JourneyEvent
  index: number
  selected: boolean
  canEdit: boolean
  canRemove: boolean
  canMove: boolean
  onReceipt: (assetId: string) => void
  onSelect: () => void
  onExpand: (index?: number) => void
  onEdit: () => void
  onRemove: () => void
  onRead: () => void
}) {
  const reduced = useReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  const hold = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pointer = useRef({ x: 0, y: 0 })
  function cancelHold() {
    if (hold.current) clearTimeout(hold.current)
    hold.current = null
  }
  useEffect(() => cancelHold, [])
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
  const transit = entry.category === "TRANSIT"
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
  return (
    <ContextMenu.Root
      disabled={!canEdit && !canRemove}
      open={menuOpen}
      onOpenChange={setMenuOpen}
    >
      <ContextMenu.Trigger
        render={<motion.article animate={{ opacity: isDragging ? 0.7 : 1 }} />}
        ref={canMove ? ref : undefined}
        id={`record-${entry.id}`}
        data-record-id={entry.id}
        data-event-category={entry.category || "VISIT"}
        tabIndex={0}
        aria-label={title}
        aria-current={selected ? "true" : undefined}
        onPointerDownCapture={(event) => {
          if (
            event.pointerType !== "mouse" ||
            event.button !== 0 ||
            (!canEdit && !canRemove)
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
            !menuOpen &&
            !isDragging &&
            !(event.target as HTMLElement).closest("button")
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
        className={`journal-card ${transit ? "journal-card-transit" : horizontal ? "journal-card-horizontal" : "journal-card-portrait"} relative scroll-mt-3 outline-offset-4 ${canMove ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
      >
        {hasCover && (
          <EventCover event={entry} title={title} onOpen={onExpand} />
        )}
        <div className="journal-card-content">
          {transit ? (
            <>
              <h2 className="sr-only">{title}</h2>
              <TransitEventCard event={entry} />
            </>
          ) : (
            <>
              <div className="journal-card-topline">
                {city && <div className="journal-card-city">{city}</div>}
                {horizontal && times.range && (
                  <span className="journal-card-time">{times.range}</span>
                )}
              </div>
              <h2>
                <button
                  type="button"
                  className="text-left focus-visible:outline-2 focus-visible:outline-russet"
                  aria-label={`展开${title}的详情`}
                  onClick={onRead}
                >
                  {title}
                </button>
              </h2>
              {!horizontal && times.range && (
                <div className="journal-card-time">
                  <Clock3 size={14} aria-hidden="true" />
                  {times.range}
                </div>
              )}
            </>
          )}
          <div
            className={
              transit && (body || entry.receipts.length)
                ? "journal-transit-footer"
                : undefined
            }
          >
            {body && (
              <p className={transit ? "line-clamp-1" : "line-clamp-3"}>
                {body}
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
          {!transit && (
            <div className="journal-card-tags">
              {entry.category && (
                <span>{eventCategoryLabels[entry.category]}</span>
              )}
              {entry.cuisine && <span>{entry.cuisine}</span>}
            </div>
          )}
          {entry.source && (
            <div className="journal-card-source">
              <UserSource user={entry.source} />
            </div>
          )}
        </div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Positioner
          sideOffset={6}
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
