"use client"

import { useEffect, useRef, type ReactNode } from "react"
import Image from "next/image"
import {
  BedDouble,
  AlertCircle,
  BusFront,
  CalendarDays,
  Car,
  Clock3,
  Footprints,
  Landmark,
  LoaderCircle,
  MapPin,
  Plane,
  Route,
  Sparkles,
  TrainFront,
  UtensilsCrossed,
} from "lucide-react"
import { matchPhotosToNode } from "@/lib/geo"
import { plannedLocationOf } from "@/lib/journeys/locations"
import {
  activeTransitPlanningRun,
  selectedTransitPlan,
  type TransportMode,
} from "@/lib/journeys/planning"
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
  TargetJourneyEvent,
  TargetResolvedEvent,
  TargetTransitPlanningRun,
} from "@/modules/data-model/contracts"
import { selectWorkspaceGraph } from "@/modules/workspace/state/selectors"
import {
  getJourneyScopeTreeEvents,
  type JourneyScopeItem,
} from "@/lib/journeys/projections"

type LocationJourneyEvent = Extract<
  TargetJourneyEvent,
  { type: "VISIT" | "STAY" | "MEAL" | "ACTIVITY" }
>
type TransitEvent = Extract<TargetJourneyEvent, { type: "TRANSIT" }>
type MatchedPhoto = ReturnType<typeof matchPhotosToNode>[number]

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

export default function RouteTimeline({
  items,
}: {
  items: JourneyScopeItem[]
}) {
  const itemRefs = useRef(new Map<string, HTMLDivElement>())
  const photoShares = useWorkspaceStore((state) => state.photoShares)
  const graph = useWorkspaceStore(selectWorkspaceGraph)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeSectionEventId = useWorkspaceStore(
    (state) => state.activeSectionEventId
  )
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
  const pendingTransitPlanSelection = useWorkspaceStore(
    (state) => state.pendingTransitPlanSelection
  )
  const transitPlanSelectionError = useWorkspaceStore(
    (state) => state.transitPlanSelectionError
  )
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)
  const enterSectionView = useWorkspaceStore((state) => state.enterSectionView)

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

  const enterSection = (eventId: string) => {
    setSelectedLocationEvent(null)
    setSelectedTransitEventId(null)
    enterSectionView(eventId)
    requestMapFocus({ type: "active-journey", maxZoom: 15 })
  }

  const events = items.map((item) => item.event)
  const summaryEvents = graph
    ? getJourneyScopeTreeEvents(graph, viewLevel, activeSectionEventId)
    : events
  const eventById = new Map(graph?.events.map((event) => [event.id, event]))
  const transits = transitEvents(summaryEvents)
  const durationMinutes = totalDurationMinutes(summaryEvents)
  return (
    <div className="px-5 pt-2 pb-5">
      <div className="rounded-xl border border-olive/20 bg-route-summary px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black tracking-[0.08em] text-ink">
              当前路线
            </p>
            <p className="mt-1 text-[18px] leading-6 font-black text-ink">
              {locationCount(summaryEvents)} 项安排
              {durationMinutes
                ? ` · ${formatStayDuration(durationMinutes)}`
                : ""}
            </p>
          </div>
          <Route className="mt-1 h-5 w-5 text-olive" aria-hidden="true" />
        </div>
        <p className="mt-2 text-[10px] font-bold text-teak">
          {readyTransitCount(summaryEvents)}/{transits.length} 段真实路线 ·
          方案确认后地图自动同步
        </p>
      </div>

      <div className="mt-4 space-y-3">
        {items.map(({ event, resolved }) => {
          if (event.type === "SECTION") {
            return (
              <button
                key={event.id}
                type="button"
                aria-label={`进入分组 ${event.title}`}
                onClick={() => enterSection(event.id)}
                className="group w-full rounded-xl border border-ink-10 bg-white px-4 py-4 text-left transition hover:-translate-y-0.5 hover:border-russet hover:shadow-periplus-soft"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-route-summary text-olive">
                    <CalendarDays className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] font-black tracking-[0.08em] text-teak">
                      {sectionKindLabel(event.detail.kind)} · 子行程
                    </span>
                    <span className="mt-1 block truncate text-base font-black text-ink">
                      {resolved.title}
                    </span>
                  </span>
                  <span className="text-[11px] font-black text-coral">
                    进入
                  </span>
                </span>
              </button>
            )
          }
          if (event.type === "TRANSIT") {
            const fromTitle = event.detail.plannedFromEventId
              ? eventById.get(event.detail.plannedFromEventId)?.title
              : undefined
            const toTitle = event.detail.plannedToEventId
              ? eventById.get(event.detail.plannedToEventId)?.title
              : undefined
            return (
              <TransitTimelineRow
                key={event.id}
                event={event}
                selected={selectedTransitEventId === event.id}
                onSelect={() => selectTransit(event)}
                onSelectPlan={(planId) => selectTransitPlan(event.id, planId)}
                planningRuns={graph?.transitPlanningRuns ?? []}
                resolved={resolved}
                fromTitle={fromTitle}
                toTitle={toTitle}
                pendingPlanId={
                  pendingTransitPlanSelection?.eventId === event.id
                    ? pendingTransitPlanSelection.planId
                    : null
                }
                selectionBlocked={Boolean(pendingTransitPlanSelection)}
                selectionError={
                  transitPlanSelectionError?.eventId === event.id
                    ? transitPlanSelectionError.message
                    : null
                }
              />
            )
          }
          if (
            event.type === "VISIT" ||
            event.type === "STAY" ||
            event.type === "MEAL" ||
            event.type === "ACTIVITY"
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
              >
                <button
                  type="button"
                  aria-label={`选择事件 ${event.title}`}
                  aria-current={selected ? "true" : undefined}
                  onClick={() => selectLocation(event)}
                  onMouseEnter={() => setHoveredEventId(event.id)}
                  onMouseLeave={() => setHoveredEventId(null)}
                  className={`w-full overflow-hidden rounded-xl border text-left transition ${
                    selected
                      ? "border-russet bg-selected-soft shadow-periplus-soft"
                      : "border-ink-10 bg-white hover:-translate-y-0.5 hover:border-russet hover:shadow-periplus-soft"
                  }`}
                >
                  <LocationEventCard event={event} photos={photos} />
                </button>
              </div>
            )
          }
          return event.type === "NOTE" ? (
            <div
              key={event.id}
              className="rounded-xl border border-dashed border-ink-15 bg-cream/55 px-4 py-3 text-sm leading-6 text-walnut"
            >
              {event.detail.body}
            </div>
          ) : null
        })}
      </div>
    </div>
  )
}

function LocationEventCard({
  event,
  photos,
}: {
  event: LocationJourneyEvent
  photos: MatchedPhoto[]
}) {
  if (event.type === "MEAL") return <MealEventCard event={event} />
  if (event.type === "ACTIVITY") return <ActivityEventCard event={event} />
  if (event.type === "STAY") return <StayEventCard event={event} />
  return <VisitEventCard event={event} photos={photos} />
}

function VisitEventCard({
  event,
  photos,
}: {
  event: Extract<LocationJourneyEvent, { type: "VISIT" }>
  photos: MatchedPhoto[]
}) {
  return (
    <>
      {photos.length ? (
        <span
          data-photo-board
          className={`grid h-28 gap-2 px-4 pt-4 ${
            photos.length === 1
              ? "grid-cols-1"
              : photos.length === 2
                ? "grid-cols-2"
                : "grid-cols-3"
          }`}
        >
          {photos.slice(0, 3).map((photo, index) => (
            <span
              key={photo.id}
              data-photo-item
              className="relative min-w-0 overflow-hidden rounded-lg bg-cream"
            >
              <Image
                src={photo.url}
                alt=""
                fill
                sizes="380px"
                unoptimized
                className="object-cover"
              />
              {index === 2 && photos.length > 3 ? (
                <span className="absolute inset-0 flex items-center justify-center bg-ink/55 text-sm font-black text-soft-white">
                  +{photos.length - 3}
                </span>
              ) : null}
            </span>
          ))}
        </span>
      ) : null}
      <span className="block px-4 py-4">
        <EventCardHeading
          icon={<Landmark className="h-3.5 w-3.5" aria-hidden="true" />}
          label="景点"
          time={formatEventTime(event.plannedStartAt)}
        />
        <span className="mt-2 block text-[17px] leading-6 font-black text-ink">
          {event.title}
        </span>
        {event.description ? (
          <span className="mt-1 line-clamp-2 block text-[12px] leading-5 text-walnut">
            {event.description}
          </span>
        ) : null}
        <EventMetaRow
          duration={event.detail.plannedDurationMinutes}
          status={event.executionStatus}
        />
      </span>
    </>
  )
}

function MealEventCard({
  event,
}: {
  event: Extract<LocationJourneyEvent, { type: "MEAL" }>
}) {
  return (
    <span className="grid grid-cols-[52px_1fr] gap-3 p-4">
      <span className="flex h-[52px] w-[52px] items-center justify-center rounded-xl bg-russet/15 text-coral">
        <UtensilsCrossed className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <EventCardHeading
          icon={<Clock3 className="h-3.5 w-3.5" aria-hidden="true" />}
          label={event.detail.cuisine ?? "餐饮"}
          time={formatEventTime(event.plannedStartAt)}
          tone="russet"
        />
        <span className="mt-2 block truncate text-[17px] leading-6 font-black text-ink">
          {event.title}
        </span>
        {event.description ? (
          <span className="mt-1 line-clamp-2 block text-[12px] leading-5 text-walnut">
            {event.description}
          </span>
        ) : null}
        <EventMetaRow
          duration={event.detail.plannedDurationMinutes}
          status={event.executionStatus}
        />
      </span>
    </span>
  )
}

function ActivityEventCard({
  event,
}: {
  event: Extract<LocationJourneyEvent, { type: "ACTIVITY" }>
}) {
  return (
    <span className="grid grid-cols-[72px_1fr]">
      <span className="flex min-h-32 flex-col items-center justify-center bg-cream/70 px-2 text-center">
        <Sparkles className="h-5 w-5 text-mustard" aria-hidden="true" />
        <span className="mt-2 text-[13px] font-black text-ink">
          {formatEventTime(event.plannedStartAt) ?? "灵活"}
        </span>
        <span className="mt-1 text-[10px] font-bold text-teak">体验</span>
      </span>
      <span className="min-w-0 px-4 py-4">
        <EventCardHeading label="活动" tone="mustard" />
        <span className="mt-2 block text-[17px] leading-6 font-black text-ink">
          {event.title}
        </span>
        {event.description ? (
          <span className="mt-1 line-clamp-2 block text-[12px] leading-5 text-walnut">
            {event.description}
          </span>
        ) : null}
        {event.detail.bookingReference ? (
          <span className="mt-3 block rounded-lg bg-cream/65 px-3 py-2 text-[10px] font-bold text-teak">
            预约凭证 · {event.detail.bookingReference}
          </span>
        ) : (
          <EventMetaRow
            duration={event.detail.plannedDurationMinutes}
            status={event.executionStatus}
          />
        )}
      </span>
    </span>
  )
}

function StayEventCard({
  event,
}: {
  event: Extract<LocationJourneyEvent, { type: "STAY" }>
}) {
  return (
    <span className="block p-4">
      <span className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bluegray/12 text-bluegray">
          <BedDouble className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <EventCardHeading label="住宿" tone="bluegray" />
          <span className="mt-1.5 block truncate text-[17px] leading-6 font-black text-ink">
            {event.title}
          </span>
        </span>
      </span>
      <span className="mt-4 grid grid-cols-2 divide-x divide-ink-10 rounded-lg bg-route-blue-soft px-1 py-3">
        <StayTime label="入住" value={formatEventTime(event.plannedStartAt)} />
        <StayTime label="离店" value={formatEventTime(event.plannedEndAt)} />
      </span>
      {event.detail.checkInNote || event.description ? (
        <span className="mt-3 block text-[11px] leading-5 text-walnut">
          {event.detail.checkInNote ?? event.description}
        </span>
      ) : null}
    </span>
  )
}

function EventCardHeading({
  icon,
  label,
  time,
  tone = "olive",
}: {
  icon?: ReactNode
  label: string
  time?: string | null
  tone?: "olive" | "russet" | "mustard" | "bluegray"
}) {
  const toneClass = {
    olive: "bg-route-summary text-ink",
    russet: "bg-russet/15 text-coral",
    mustard: "bg-mustard/20 text-ink",
    bluegray: "bg-bluegray/12 text-bluegray",
  }[tone]
  return (
    <span className="flex items-center justify-between gap-3">
      <span
        className={`inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[10px] font-black tracking-[0.06em] ${toneClass}`}
      >
        {icon}
        {label}
      </span>
      {time ? (
        <span className="text-[11px] font-black text-teak tabular-nums">
          {time}
        </span>
      ) : null}
    </span>
  )
}

function EventMetaRow({
  duration,
  status,
}: {
  duration?: number
  status: LocationJourneyEvent["executionStatus"]
}) {
  return (
    <span className="mt-3 flex items-center gap-3 text-[10px] font-bold text-teak">
      {duration ? (
        <span className="inline-flex items-center gap-1">
          <Clock3 className="h-3 w-3" aria-hidden="true" />
          {formatStayDuration(duration)}
        </span>
      ) : null}
      <span className="inline-flex items-center gap-1">
        <MapPin className="h-3 w-3" aria-hidden="true" />
        {executionStatusLabel(status)}
      </span>
    </span>
  )
}

function StayTime({ label, value }: { label: string; value?: string | null }) {
  return (
    <span className="px-3">
      <span className="block text-[9px] font-black tracking-[0.08em] text-teak">
        {label}
      </span>
      <span className="mt-1 block text-[14px] font-black text-ink tabular-nums">
        {value ?? "待定"}
      </span>
    </span>
  )
}

function TransitTimelineRow({
  event,
  selected,
  onSelect,
  onSelectPlan,
  planningRuns,
  resolved,
  fromTitle,
  toTitle,
  pendingPlanId,
  selectionBlocked,
  selectionError,
}: {
  event: TransitEvent
  selected: boolean
  onSelect: () => void
  onSelectPlan: (planId: string) => void
  planningRuns: readonly TargetTransitPlanningRun[]
  resolved: TargetResolvedEvent
  fromTitle?: string
  toTitle?: string
  pendingPlanId: string | null
  selectionBlocked: boolean
  selectionError: string | null
}) {
  const activeRun = activeTransitPlanningRun(event, planningRuns)
  const plan = selectedTransitPlan(event, planningRuns)
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
    <div
      className="rounded-xl border border-bluegray/20 bg-route-blue-soft p-3"
      data-selected-plan-id={plan?.id}
      data-resolved-position={resolved.resolvedPosition}
      aria-busy={Boolean(pendingPlanId)}
    >
      <button
        type="button"
        aria-label={`交通事件 ${modeLabel}`}
        aria-pressed={selected}
        onClick={onSelect}
        className={`w-full rounded-lg px-1 py-1 text-left transition ${
          selected ? "text-ink" : "text-walnut hover:text-ink"
        }`}
      >
        <span className="flex items-center gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              selected
                ? "bg-bluegray text-soft-white"
                : "bg-white text-bluegray"
            }`}
          >
            <TransportIcon mode={event.detail.transportMode} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-black tracking-[0.08em] text-bluegray">
              {modeLabel}
              {[duration, distance].filter(Boolean).length
                ? ` · ${[duration, distance].filter(Boolean).join(" · ")}`
                : ""}
            </span>
            <span className="mt-1 flex min-w-0 items-center gap-2 text-[12px] font-black text-ink">
              <span className="truncate">{fromTitle ?? "出发地"}</span>
              <span className="text-bluegray" aria-hidden="true">
                →
              </span>
              <span className="truncate">{toTitle ?? "目的地"}</span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-[10px] font-black text-bluegray">
            {pendingPlanId ? (
              <LoaderCircle
                className="h-3 w-3 animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {pendingPlanId ? "切换中…" : selected ? "收起" : "方案"}
          </span>
        </span>
        {activeRun?.warning ? (
          <span className="mt-2 block rounded-md bg-white/70 px-2 py-1.5 text-[10px] leading-4 text-coral">
            {activeRun.warning}
          </span>
        ) : null}
      </button>
      {selectionError ? (
        <p
          role="alert"
          className="mt-2 rounded-md bg-coral/10 px-2 py-1.5 text-[10px] leading-4 font-bold text-coral"
        >
          <AlertCircle className="mr-1 inline h-3 w-3" aria-hidden="true" />
          路线切换失败：{selectionError}
        </p>
      ) : null}
      {selected && (activeRun?.plans.length ?? 0) > 0 ? (
        <div className="mt-3 border-t border-bluegray/15 pt-3">
          <p className="mb-2 text-[10px] font-black tracking-[0.08em] text-teak">
            选择路线方案
          </p>
          <div className="relative -mx-3">
            <div className="scrollbar-hidden flex gap-2 overflow-x-auto px-4 pr-10">
              {activeRun!.plans.map((candidate) => {
                const isCurrent = plan?.id === candidate.id
                const isPending = pendingPlanId === candidate.id
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    aria-pressed={isCurrent}
                    aria-busy={isPending}
                    disabled={selectionBlocked}
                    onClick={() => onSelectPlan(candidate.id)}
                    className={`h-10 w-[122px] shrink-0 rounded-lg border px-2 text-left transition disabled:cursor-wait disabled:opacity-60 ${
                      isCurrent
                        ? "border-russet bg-white shadow-sm"
                        : "border-transparent bg-white/60 hover:border-bluegray/25 hover:bg-white"
                    }`}
                  >
                    <span className="block min-w-0">
                      <span className="block truncate text-[10px] font-black text-ink">
                        <span className="truncate">
                          {isPending ? "切换中…" : candidate.label}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-[9px] font-bold text-teak">
                        {formatTransitDuration(candidate.durationSeconds)} ·{" "}
                        {formatTransitDistance(candidate.distanceMeters)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-0 right-0 h-full w-8 bg-gradient-to-l from-route-blue-soft to-transparent"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TransportIcon({ mode }: { mode: TransportMode }) {
  const className = "h-5 w-5"
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

function formatEventTime(value?: string) {
  if (!value) return null
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value))
}

function executionStatusLabel(status: LocationJourneyEvent["executionStatus"]) {
  if (status === "CONFIRMED") return "已确认"
  if (status === "STARTED") return "进行中"
  if (status === "SKIPPED") return "已跳过"
  if (status === "CANCELLED") return "已取消"
  return "计划中"
}

function sectionKindLabel(kind: "CITY" | "DAY" | "THEME") {
  if (kind === "DAY") return "日期"
  if (kind === "CITY") return "城市"
  return "主题"
}
