"use client"

import { useEffect, useRef, useState } from "react"
import { DragDropProvider } from "@dnd-kit/react"
import type { JourneyEvent } from "@/modules/data-model/contracts"
import type { JourneyDayProjection } from "@/lib/journeys/day-groups"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import EventCard from "@/modules/travelogue/ui/workbench/EventCard"
import EventDetails from "@/modules/travelogue/ui/workbench/EventDetails"
import ReceiptDetails from "@/modules/travelogue/ui/workbench/ReceiptDetails"
import PhotoViewer from "@/modules/travelogue/ui/workbench/PhotoViewer"
import { photoItems } from "@/modules/travelogue/ui/photo-items"

export default function RouteTimeline({
  events,
  dayProjection,
  onActiveDayChange,
  changedEventIds = [],
}: {
  events: JourneyEvent[]
  dayProjection: JourneyDayProjection
  onActiveDayChange: (key: string) => void
  changedEventIds?: readonly string[]
}) {
  const root = useRef<HTMLDivElement>(null)
  const selected = useWorkspaceStore((state) => state.selectedEventId)
  const selectEvent = useWorkspaceStore((state) => state.selectEvent)
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [photoEventId, setPhotoEventId] = useState<string | null>(null)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [receiptSelection, setReceiptSelection] = useState<{
    eventId: string
    assetId: string
  } | null>(null)
  const details = events.find((event) => event.id === detailsId)
  const receipt = events
    .find((event) => event.id === receiptSelection?.eventId)
    ?.receipts?.find((item) => item.assetId === receiptSelection?.assetId)
  const photoEvent = events.find((event) => event.id === photoEventId)

  useEffect(() => {
    if (selected)
      document
        .getElementById(`record-${selected}`)
        ?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [selected])
  useEffect(() => {
    const list = root.current
    const viewport = list?.closest<HTMLElement>(
      "[data-overlay-scroll-viewport]"
    )
    if (!list || !viewport) return
    const update = () => {
      const header = list
        .closest("[data-route-preview]")
        ?.querySelector("[data-route-preview-header]")
      const top =
        viewport.getBoundingClientRect().top +
        (header?.getBoundingClientRect().height ?? 0) +
        10
      const cards = Array.from(
        list.querySelectorAll<HTMLElement>("[data-route-day-key]")
      )
      let key = cards[0]?.dataset.routeDayKey
      for (const card of cards) {
        if (card.getBoundingClientRect().top > top) break
        key = card.dataset.routeDayKey
      }
      if (key) onActiveDayChange(key)
    }
    viewport.addEventListener("scroll", update, { passive: true })
    return () => viewport.removeEventListener("scroll", update)
  }, [dayProjection, onActiveDayChange])

  return (
    <div ref={root} className="journal-workspace-list space-y-7 px-5 pt-3 pb-6">
      <DragDropProvider>
        {events.map((event, index) => (
          <div
            key={event.id}
            data-route-event-id={event.id}
            data-route-day-key={dayProjection.groupKeyByEventId.get(event.id)}
            className={
              changedEventIds.includes(event.id)
                ? "rounded-xl ring-2 ring-mustard/40"
                : undefined
            }
          >
            <EventCard
              entry={event}
              index={index}
              selected={event.id === selected}
              canEdit={false}
              canMove={false}
              onSelect={() => {
                selectEvent(event.id)
                requestMapFocus(
                  event.category === "TRANSIT"
                    ? { type: "transit", eventId: event.id, maxZoom: 14 }
                    : { type: "event", eventId: event.id, zoom: 15 }
                )
              }}
              onExpand={(index = 0) => {
                setPhotoEventId(event.id)
                setPhotoIndex(index)
              }}
              onRead={() => setDetailsId(event.id)}
              onEdit={() => {}}
              onReceipt={(assetId) =>
                setReceiptSelection({ eventId: event.id, assetId })
              }
            />
          </div>
        ))}
      </DragDropProvider>
      {details && (
        <EventDetails
          key={details.id}
          entry={details}
          onClose={() => setDetailsId(null)}
          onReceipt={(assetId) =>
            setReceiptSelection({ eventId: details.id, assetId })
          }
        />
      )}
      {receipt && receiptSelection && (
        <ReceiptDetails
          key={`${receiptSelection.eventId}:${receipt.assetId}`}
          eventId={receiptSelection.eventId}
          receipt={receipt}
          onClose={() => setReceiptSelection(null)}
        />
      )}
      {photoEvent && (
        <PhotoViewer
          photos={photoItems([photoEvent])}
          initialIndex={photoIndex}
          onClose={() => setPhotoEventId(null)}
        />
      )}
    </div>
  )
}
