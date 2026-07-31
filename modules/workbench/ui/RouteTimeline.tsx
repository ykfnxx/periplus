"use client"

import { useEffect, useRef } from "react"
import Image from "next/image"
import { BusFront, Car, Footprints, Plane, TrainFront } from "lucide-react"
import { matchPhotosToNode } from "@/lib/geo"
import { plannedLocationOf } from "@/lib/journeys/locations"
import { selectedTransitPlan } from "@/lib/journeys/planning"
import {
  formatTransitDistance,
  formatTransitDuration,
} from "@/lib/journeys/display"
import {
  locationCount,
  readyTransitCount,
  totalDurationMinutes,
  transitEvents,
} from "@/lib/journeys/summary"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type {
  JourneyEvent,
  LocationJourneyEvent,
  TransitEvent,
  TransportMode,
} from "@/types/journey"

const transportLabels: Record<TransportMode, string> = {
  FLIGHT: "飞机",
  TRAIN: "火车",
  CAR: "驾车",
  BUS: "公交",
  WALK: "步行",
  TAXI: "出租车",
  SUBWAY: "地铁",
  RENTAL: "租车",
}

export default function RouteTimeline({ events }: { events: JourneyEvent[] }) {
  const itemRefs = useRef(new Map<string, HTMLDivElement>())
  const photoShares = useWorkspaceStore((state) => state.photoShares)
  const selectedLocationEvent = useWorkspaceStore(
    (state) => state.selectedLocationEvent
  )
  const selectedTransitEventId = useWorkspaceStore(
    (state) => state.selectedTransitEventId
  )
  const setSelectedLocationEvent = useWorkspaceStore(
    (state) => state.setSelectedLocationEvent
  )
  const setHoveredEventId = useWorkspaceStore(
    (state) => state.setHoveredEventId
  )
  const setSelectedTransitEventId = useWorkspaceStore(
    (state) => state.setSelectedTransitEventId
  )
  const selectTransitPlan = useWorkspaceStore(
    (state) => state.selectTransitPlan
  )
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)

  useEffect(() => {
    if (!selectedLocationEvent) return
    itemRefs.current.get(selectedLocationEvent.id)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    })
  }, [selectedLocationEvent])

  const selectLocation = (event: LocationJourneyEvent) => {
    setSelectedTransitEventId(null)
    setSelectedLocationEvent(event)
    requestMapFocus({ type: "event", eventId: event.id, zoom: 15 })
  }
  const selectTransit = (event: TransitEvent) => {
    setSelectedLocationEvent(null)
    const next = selectedTransitEventId === event.id ? null : event.id
    setSelectedTransitEventId(next)
    if (next)
      requestMapFocus({ type: "transit", eventId: event.id, maxZoom: 14 })
  }

  const transits = transitEvents(events)
  const durationMinutes = totalDurationMinutes(events)
  return (
    <div className="px-5 pt-2 pb-5">
      <div className="rounded-[10px] border border-olive/20 bg-route-summary px-5 py-3.5">
        <p className="text-[11px] font-black text-ink">城市行程</p>
        <p className="mt-1 text-[18px] leading-6 font-black text-ink">
          {locationCount(events)} 个地点
          {durationMinutes ? ` · ${formatStayDuration(durationMinutes)}` : ""}
        </p>
        <p className="mt-1 text-[10px] font-bold text-teak">
          {readyTransitCount(events)}/{transits.length} 段真实路线 ·
          地图与事件卡同步定位
        </p>
      </div>

      <div className="relative mt-5 pl-10">
        <div className="absolute top-4 bottom-4 left-[15px] w-0.5 bg-bluegray" />
        {events.map((event, index) => {
          if (event.type === "TRANSIT") {
            return (
              <TransitTimelineRow
                key={event.id}
                event={event}
                selected={selectedTransitEventId === event.id}
                onSelect={() => selectTransit(event)}
                onSelectPlan={(planId) => selectTransitPlan(event.id, planId)}
              />
            )
          }
          if (
            event.type === "VISIT" ||
            event.type === "STAY" ||
            event.type === "MEAL" ||
            event.type === "ACTIVITY" ||
            event.type === "SECTION"
          ) {
            const location = plannedLocationOf(event)
            const photos = location
              ? matchPhotosToNode(location.lat, location.lng, photoShares)
              : []
            const selected = selectedLocationEvent?.id === event.id
            return (
              <div
                key={event.id}
                ref={(element) => {
                  if (element) itemRefs.current.set(event.id, element)
                  else itemRefs.current.delete(event.id)
                }}
                className="relative"
              >
                <button
                  type="button"
                  aria-label={`选择事件 ${event.title}`}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => selectLocation(event)}
                  onMouseEnter={() => setHoveredEventId(event.id)}
                  onMouseLeave={() => setHoveredEventId(null)}
                  className={`mb-3 w-full rounded-[10px] border px-4 py-3 text-left transition ${
                    selected
                      ? "border-russet bg-selected-soft shadow-periplus-soft"
                      : "border-ink-10 bg-white hover:-translate-y-0.5 hover:border-russet"
                  }`}
                >
                  <span className="absolute top-3 -left-[39px] flex h-6 w-6 items-center justify-center rounded-full border-[3px] border-white bg-route-blue text-[10px] font-black text-ink shadow-sm">
                    {index + 1}
                  </span>
                  <span className="block text-[10px] font-black text-teak">
                    {event.type} · {event.executionStatus ?? "分组"}
                  </span>
                  <span className="mt-1 block text-base font-black text-ink">
                    {event.title}
                  </span>
                  {event.description ? (
                    <span className="mt-1 block text-[12px] leading-5 text-walnut">
                      {event.description}
                    </span>
                  ) : null}
                  {photos.length ? (
                    <span className="scrollbar-hidden mt-3 flex gap-2 overflow-x-auto">
                      {photos.map((photo) => (
                        <span
                          key={photo.id}
                          className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg"
                        >
                          <Image
                            src={photo.url}
                            alt=""
                            fill
                            sizes="80px"
                            unoptimized
                            className="object-cover"
                          />
                        </span>
                      ))}
                    </span>
                  ) : null}
                </button>
              </div>
            )
          }
          return event.type === "NOTE" ? (
            <div
              key={event.id}
              className="mb-3 rounded-lg border border-ink-10 bg-cream px-4 py-3 text-sm text-walnut"
            >
              {event.detail.body}
            </div>
          ) : null
        })}
      </div>
    </div>
  )
}

function TransitTimelineRow({
  event,
  selected,
  onSelect,
  onSelectPlan,
}: {
  event: TransitEvent
  selected: boolean
  onSelect: () => void
  onSelectPlan: (planId: string) => void
}) {
  const plan = selectedTransitPlan(event)
  const modeLabel =
    event.detail.requestMode === "TRANSIT"
      ? "公共交通"
      : transportLabels[event.detail.transportMode]
  const duration = plan?.durationSeconds
    ? formatTransitDuration(plan.durationSeconds)
    : event.detail.plannedDurationMinutes
      ? formatTransitDuration(event.detail.plannedDurationMinutes * 60)
      : null
  const distance = plan?.distanceMeters
    ? formatTransitDistance(plan.distanceMeters)
    : event.detail.plannedDistanceKm
      ? formatTransitDistance(event.detail.plannedDistanceKm * 1_000)
      : null

  return (
    <div className="relative mb-3">
      <span className="absolute top-3 -left-[32px] flex h-4 w-4 items-center justify-center rounded-full border-2 border-soft-white bg-bluegray">
        <TransportIcon mode={event.detail.transportMode} />
      </span>
      <button
        type="button"
        aria-label={`交通事件 ${modeLabel}`}
        aria-pressed={selected}
        onClick={onSelect}
        className={`w-full rounded-lg border px-4 py-3 text-left transition ${
          selected
            ? "border-russet bg-selected-soft"
            : "border-transparent bg-route-blue-soft hover:border-bluegray/30"
        }`}
      >
        <span className="text-[11px] font-black text-bluegray">
          {modeLabel} {[duration, distance].filter(Boolean).join(" · ")}
        </span>
        {event.detail.planningWarning ? (
          <span className="mt-1.5 block text-[10px] text-coral">
            {event.detail.planningWarning}
          </span>
        ) : null}
      </button>
      {selected && (event.detail.plans?.length ?? 0) > 1 ? (
        <div className="mt-2 rounded-lg border border-ink-10 bg-white p-3">
          <p className="mb-2 text-[10px] font-black text-teak">路线方案</p>
          <div className="scrollbar-hidden flex gap-2 overflow-x-auto">
            {event.detail.plans!.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => onSelectPlan(candidate.id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-black ${
                  plan?.id === candidate.id
                    ? "bg-russet text-ink"
                    : "bg-cream text-walnut"
                }`}
              >
                {candidate.label} ·{" "}
                {formatTransitDuration(candidate.durationSeconds)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TransportIcon({ mode }: { mode: TransportMode }) {
  const className = "h-2 w-2 text-soft-white"
  if (mode === "FLIGHT") return <Plane className={className} />
  if (mode === "TRAIN") return <TrainFront className={className} />
  if (mode === "WALK") return <Footprints className={className} />
  if (mode === "BUS" || mode === "SUBWAY") {
    return <BusFront className={className} />
  }
  return <Car className={className} />
}

function formatStayDuration(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours} 小时` : `${hours.toFixed(1)} 小时`
}
