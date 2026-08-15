"use client"

import { useEffect, useRef, useState, type ReactNode, type Ref } from "react"
import type {
  JourneyDayGroup,
  JourneyDayProjection,
} from "@/lib/journeys/day-groups"
import {
  BedDouble,
  BusFront,
  CalendarDays,
  Car,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Footprints,
  Landmark,
  MapPin,
  Plane,
  Route,
  Sparkles,
  TrainFront,
  UtensilsCrossed,
} from "lucide-react"
import {
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
import { selectWorkspaceJourneyView } from "@/modules/workspace/state/selectors"
import {
  getJourneyScopeTreeEvents,
  type JourneyScopeItem,
} from "@/lib/journeys/projections"
import { ProviderImage } from "./ProviderImage"
import { routeDayTone } from "./route-day-theme"

export type LocationJourneyEvent = Extract<
  TargetJourneyEvent,
  { type: "VISIT" | "STAY" | "MEAL" | "ACTIVITY" }
>
type TransitEvent = Extract<TargetJourneyEvent, { type: "TRANSIT" }>

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
  dayProjection,
  onActiveDayChange,
  changedEventIds = [],
}: {
  items: JourneyScopeItem[]
  dayProjection?: JourneyDayProjection
  onActiveDayChange?: (dayKey: string) => void
  changedEventIds?: readonly string[]
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef(new Map<string, HTMLDivElement>())
  const graph = useWorkspaceStore(selectWorkspaceJourneyView)
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
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)
  const enterSectionView = useWorkspaceStore((state) => state.enterSectionView)
  const changedEventIdSet = new Set(changedEventIds)

  useEffect(() => {
    if (!selectedLocationEvent) return
    itemRefs.current.get(selectedLocationEvent.id)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    })
  }, [selectedLocationEvent])

  useEffect(() => {
    const list = listRef.current
    if (!list || !dayProjection?.groups.length || !onActiveDayChange) return
    const viewport = list.closest<HTMLElement>("[data-overlay-scroll-viewport]")
    const preview = list.closest<HTMLElement>("[data-route-preview]")
    const header = preview?.querySelector<HTMLElement>(
      "[data-route-preview-header]"
    )
    if (!viewport || !header) return

    let animationFrame = 0
    const updateActiveDay = () => {
      animationFrame = 0
      const eventElements = Array.from(
        list.querySelectorAll<HTMLElement>("[data-route-day-key]")
      )
      const firstKey = eventElements[0]?.dataset.routeDayKey
      if (!firstKey) return

      const threshold =
        viewport.getBoundingClientRect().top +
        header.getBoundingClientRect().height +
        10
      let currentKey = firstKey
      for (const element of eventElements) {
        if (element.getBoundingClientRect().top > threshold) break
        currentKey = element.dataset.routeDayKey ?? currentKey
      }
      onActiveDayChange(currentKey)
    }
    const scheduleUpdate = () => {
      if (animationFrame) return
      animationFrame = window.requestAnimationFrame(updateActiveDay)
    }

    scheduleUpdate()
    viewport.addEventListener("scroll", scheduleUpdate, { passive: true })
    window.addEventListener("resize", scheduleUpdate)
    return () => {
      viewport.removeEventListener("scroll", scheduleUpdate)
      window.removeEventListener("resize", scheduleUpdate)
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
    }
  }, [dayProjection, onActiveDayChange])

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
  const dayGroupByKey = new Map(
    dayProjection?.groups.map((group) => [group.key, group])
  )
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
          已提交路线同步到地图
        </p>
      </div>

      <div ref={listRef} data-route-timeline-list className="mt-4 space-y-3">
        {items.map(({ event, resolved }) => {
          let content: ReactNode = null
          if (event.type === "SECTION") {
            content = (
              <button
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
                      {sectionKindLabel()} · 子行程
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
          } else if (event.type === "TRANSIT") {
            const fromTitle = event.detail.plannedFromEventId
              ? eventById.get(event.detail.plannedFromEventId)?.title
              : undefined
            const toTitle = event.detail.plannedToEventId
              ? eventById.get(event.detail.plannedToEventId)?.title
              : undefined
            content = (
              <TransitEventCard
                event={event}
                selected={selectedTransitEventId === event.id}
                onSelect={() => selectTransit(event)}
                planningRuns={graph?.transitPlanningRuns ?? []}
                resolved={resolved}
                fromTitle={fromTitle}
                toTitle={toTitle}
              />
            )
          } else if (
            event.type === "VISIT" ||
            event.type === "STAY" ||
            event.type === "MEAL" ||
            event.type === "ACTIVITY"
          ) {
            const selected = selectedLocationEvent?.id === event.id
            content = (
              <LocationEventCard
                event={event}
                selected={selected}
                onSelect={() => selectLocation(event)}
                onHoverChange={(hovered) =>
                  setHoveredEventId(hovered ? event.id : null)
                }
              />
            )
          } else if (event.type === "NOTE") {
            content = (
              <div className="rounded-xl border border-dashed border-ink-15 bg-cream/55 px-4 py-3 text-sm leading-6 text-walnut">
                {event.detail.body}
              </div>
            )
          }

          const dayKey = dayProjection?.groupKeyByEventId.get(event.id)
          const dayGroup = dayKey ? dayGroupByKey.get(dayKey) : undefined
          return (
            <TimelineDayItem
              key={event.id}
              eventId={event.id}
              group={dayGroup}
              isFirstInGroup={dayGroup?.firstEventId === event.id}
              changed={changedEventIdSet.has(event.id)}
              containerRef={(element) => {
                if (element) itemRefs.current.set(event.id, element)
                else itemRefs.current.delete(event.id)
              }}
            >
              {content}
            </TimelineDayItem>
          )
        })}
      </div>
    </div>
  )
}

function TimelineDayItem({
  eventId,
  group,
  isFirstInGroup,
  changed,
  containerRef,
  children,
}: {
  eventId: string
  group?: JourneyDayGroup
  isFirstInGroup: boolean
  changed: boolean
  containerRef: (element: HTMLDivElement | null) => void
  children: ReactNode
}) {
  const tone = routeDayTone(group?.colorIndex ?? null)
  if (!group) {
    return (
      <div
        ref={containerRef}
        data-route-event-id={eventId}
        data-journey-event-changed={changed || undefined}
        className={changed ? "rounded-xl ring-2 ring-mustard/40" : undefined}
      >
        {children}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      data-route-event-id={eventId}
      data-route-day-key={group.key}
      data-day-tone={tone.id}
      data-journey-event-changed={changed || undefined}
      className={changed ? "rounded-xl ring-2 ring-mustard/40" : undefined}
    >
      {isFirstInGroup ? (
        <div
          data-route-day-divider={group.key}
          className="mb-2 flex items-center gap-2 pt-1"
        >
          <span
            aria-hidden="true"
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.marker}`}
          />
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black ${tone.soft} ${tone.text}`}
          >
            {group.label}
          </span>
          <span
            aria-hidden="true"
            className={`h-px min-w-4 flex-1 ${tone.line}`}
          />
        </div>
      ) : null}
      <div className="relative pl-4">
        <span
          aria-hidden="true"
          className={`absolute top-0 bottom-0 left-0.5 w-[5px] rounded-full ${tone.line}`}
        />
        {children}
      </div>
    </div>
  )
}

export function LocationEventCard({
  event,
  selected = false,
  onSelect,
  onHoverChange,
  containerRef,
}: {
  event: LocationJourneyEvent
  selected?: boolean
  onSelect: () => void
  onHoverChange?: (hovered: boolean) => void
  containerRef?: Ref<HTMLDivElement>
}) {
  const gallerySources =
    event.type === "VISIT" || event.type === "STAY"
      ? gallerySourcesForEvent(event)
      : []

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      className={`overflow-hidden rounded-xl border transition ${
        selected
          ? "border-russet bg-selected-soft shadow-periplus-soft"
          : "border-ink-10 bg-white hover:-translate-y-0.5 hover:border-russet hover:shadow-periplus-soft"
      }`}
    >
      {(event.type === "VISIT" || event.type === "STAY") &&
      gallerySources.length > 0 ? (
        <EventImageGallery
          title={event.title}
          category={event.type === "STAY" ? "HOTEL" : "SIGHT"}
          sources={gallerySources}
          onSelect={onSelect}
        />
      ) : null}
      <button
        type="button"
        aria-label={`选择事件 ${event.title}`}
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-russet focus-visible:ring-inset"
      >
        <LocationEventCardContent event={event} />
      </button>
    </div>
  )
}

function LocationEventCardContent({ event }: { event: LocationJourneyEvent }) {
  if (event.type === "MEAL") return <MealEventCard event={event} />
  if (event.type === "ACTIVITY") return <ActivityEventCard event={event} />
  if (event.type === "STAY") return <StayEventCard event={event} />
  return <VisitEventCard event={event} />
}

function VisitEventCard({
  event,
}: {
  event: Extract<LocationJourneyEvent, { type: "VISIT" }>
}) {
  return (
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
  )
}

function gallerySourcesForEvent(
  event: Extract<LocationJourneyEvent, { type: "VISIT" | "STAY" }>
) {
  const providerSource =
    event.type === "VISIT"
      ? event.detail.providerCoverImage?.url
      : event.detail.hotelOffer?.coverImageUrl
  return providerSource?.trim() ? [providerSource] : []
}

function EventImageGallery({
  title,
  category,
  sources,
  onSelect,
}: {
  title: string
  category: "SIGHT" | "HOTEL"
  sources: string[]
  onSelect: () => void
}) {
  const [selectedSource, setSelectedSource] = useState<string | null>(null)
  const selectedIndex = selectedSource ? sources.indexOf(selectedSource) : -1
  const activeIndex = selectedIndex >= 0 ? selectedIndex : 0
  const activeSource = sources[activeIndex]
  const hasMultipleImages = sources.length > 1

  const selectOffset = (offset: number) => {
    if (!hasMultipleImages) return
    setSelectedSource((currentSource) => {
      const currentIndex = currentSource ? sources.indexOf(currentSource) : -1
      const safeIndex = currentIndex >= 0 ? currentIndex : 0
      const nextIndex = (safeIndex + offset + sources.length) % sources.length
      return sources[nextIndex] ?? null
    })
  }

  return (
    <div
      data-photo-board
      data-active-index={activeIndex}
      role="group"
      aria-label={`${title} 图片`}
      aria-roledescription="轮播图"
      className="relative mx-4 mt-4 h-32 overflow-hidden rounded-lg bg-route-summary"
    >
      <div data-photo-item className="h-full w-full">
        <ProviderImage
          src={activeSource}
          alt={activeSource ? title : ""}
          category={category}
          width={640}
          height={256}
          className="h-full w-full object-cover"
        />
      </div>
      <span className="sr-only" aria-live="polite">
        {activeSource
          ? `第 ${activeIndex + 1} 张，共 ${sources.length} 张`
          : "暂无图片"}
      </span>
      <button
        type="button"
        aria-label={`通过图片选择事件 ${title}`}
        onClick={onSelect}
        className="absolute inset-0 z-10 outline-none focus-visible:ring-2 focus-visible:ring-russet focus-visible:ring-inset"
      />
      {hasMultipleImages ? (
        <>
          <button
            type="button"
            aria-label={`${title} 上一张图片`}
            onClick={() => selectOffset(-1)}
            className="group/previous pointer-events-auto absolute inset-y-0 left-0 z-20 flex w-14 items-center justify-start pl-2 outline-none"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/65 text-soft-white opacity-0 shadow-md backdrop-blur-sm transition-opacity group-hover/previous:opacity-100 group-focus-visible/previous:opacity-100">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </span>
          </button>
          <button
            type="button"
            aria-label={`${title} 下一张图片`}
            onClick={() => selectOffset(1)}
            className="group/next pointer-events-auto absolute inset-y-0 right-0 z-20 flex w-14 items-center justify-end pr-2 outline-none"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/65 text-soft-white opacity-0 shadow-md backdrop-blur-sm transition-opacity group-hover/next:opacity-100 group-focus-visible/next:opacity-100">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </button>
        </>
      ) : null}
    </div>
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

export function ActivityEventCard({
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
  const hotelOffer = event.detail.hotelOffer
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
      {hotelOffer ? (
        <span className="mt-3 block rounded-lg bg-route-summary p-2.5">
          <span className="block min-w-0">
            <span className="block text-[10px] font-black text-teak">
              RollingGo 报价快照
            </span>
            {hotelOffer.startingPrice ? (
              <span className="mt-0.5 block text-xs font-black text-coral">
                {hotelOffer.startingPrice.currency}{" "}
                {hotelOffer.startingPrice.amount} 起
              </span>
            ) : null}
          </span>
        </span>
      ) : null}
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

export function TransitEventCard({
  event,
  selected,
  onSelect,
  planningRuns,
  resolved,
  fromTitle,
  toTitle,
}: {
  event: TransitEvent
  selected: boolean
  onSelect: () => void
  planningRuns: readonly TargetTransitPlanningRun[]
  resolved: TargetResolvedEvent
  fromTitle?: string
  toTitle?: string
}) {
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
          <span className="shrink-0 text-[10px] font-black text-bluegray">
            {selected ? "已选中" : "查看"}
          </span>
        </span>
      </button>
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

function sectionKindLabel() {
  return "城市"
}
