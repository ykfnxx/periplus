"use client"

import { AlertCircle, ChevronRight, LoaderCircle } from "lucide-react"
import { projectMainSequence } from "@/lib/journeys/graph"
import {
  formatTransitDistance,
  formatTransitDuration,
} from "@/lib/journeys/display"
import { selectedTransitPlan } from "@/lib/journeys/planning"
import {
  locationCount,
  readyTransitCount,
  totalDurationDays,
  totalTransitDistanceMeters,
} from "@/lib/journeys/summary"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { SectionEvent, TransitEvent, TransportMode } from "@/types/journey"

const transportLabels: Partial<Record<TransportMode, string>> = {
  FLIGHT: "飞机",
  TRAIN: "火车",
  CAR: "驾车",
  BUS: "公交",
  WALK: "步行",
  TAXI: "出租车",
  SUBWAY: "地铁",
  RENTAL: "租车",
}

const markerClasses = [
  "bg-marker-orange",
  "bg-marker-mint",
  "bg-marker-yellow",
  "bg-marker-violet",
  "bg-coral",
  "bg-bluegray",
]

export default function RouteOverview() {
  const draftJourney = useWorkspaceStore((state) => state.draftJourney)
  const enterSectionView = useWorkspaceStore((state) => state.enterSectionView)
  const selectedTransitEventId = useWorkspaceStore(
    (state) => state.selectedTransitEventId
  )
  const setSelectedTransitEventId = useWorkspaceStore(
    (state) => state.setSelectedTransitEventId
  )
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)

  if (!draftJourney) return null
  const sequence = projectMainSequence(draftJourney)
  const sections = sequence.filter(
    (event): event is SectionEvent => event.type === "SECTION"
  )
  const transits = sequence.filter(
    (event): event is TransitEvent => event.type === "TRANSIT"
  )
  const childEvents = sections.flatMap((section) =>
    projectMainSequence(draftJourney, section.id)
  )

  const openSection = (eventId: string) => {
    enterSectionView(eventId)
    requestMapFocus({ type: "active-journey", maxZoom: 15 })
  }
  const selectTransit = (eventId: string) => {
    const next = selectedTransitEventId === eventId ? null : eventId
    setSelectedTransitEventId(next)
    if (next) requestMapFocus({ type: "transit", eventId, maxZoom: 12 })
  }

  return (
    <div className="space-y-3 px-5 pt-2 pb-5">
      <div className="rounded-[10px] border border-olive/20 bg-route-summary px-5 py-3.5">
        <p className="text-[11px] font-black text-ink">行程摘要</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1 text-[18px] leading-6 font-black text-ink">
          <span>{sections.length} 个城市</span>
          {totalDurationDays(childEvents) ? (
            <span>· {totalDurationDays(childEvents)} 天</span>
          ) : null}
          {totalTransitDistanceMeters(sequence) ? (
            <span>
              · {formatTransitDistance(totalTransitDistanceMeters(sequence))}
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-[10px] font-bold text-teak">
          {locationCount(childEvents)} 个地点 · {readyTransitCount(sequence)}/
          {transits.length} 段真实路线
        </p>
      </div>

      <div className="space-y-2.5">
        {sequence.map((event) =>
          event.type === "SECTION" ? (
            <SectionSummaryCard
              key={event.id}
              section={event}
              index={sections.findIndex((section) => section.id === event.id)}
              childTitles={projectMainSequence(draftJourney, event.id)
                .filter((child) => child.type !== "TRANSIT")
                .map((child) => child.title)}
              onSelect={() => openSection(event.id)}
            />
          ) : event.type === "TRANSIT" ? (
            <TransitSummaryCard
              key={event.id}
              event={event}
              selected={selectedTransitEventId === event.id}
              onSelect={() => selectTransit(event.id)}
            />
          ) : null
        )}
      </div>
    </div>
  )
}

function SectionSummaryCard({
  section,
  index,
  childTitles,
  onSelect,
}: {
  section: SectionEvent
  index: number
  childTitles: string[]
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-label={`查看城市 ${section.title}`}
      onClick={onSelect}
      className="group relative w-full rounded-[10px] border border-ink-10 bg-white px-5 py-4 text-left transition hover:-translate-y-0.5 hover:border-russet hover:shadow-periplus-soft"
    >
      <span
        className={`absolute top-[19px] -left-[7px] h-[18px] w-[26px] rounded-[3px] ${
          markerClasses[index % markerClasses.length]
        }`}
      />
      <span className="flex items-center justify-between gap-3 pl-3">
        <span className="truncate text-base font-black text-ink">
          {section.title}
        </span>
        <span className="shrink-0 text-[11px] font-black text-teak">
          {childTitles.length} 项
        </span>
      </span>
      <span className="mt-4 flex items-end justify-between gap-3 pl-1">
        <span className="min-w-0 truncate text-[13px] text-walnut">
          {childTitles.length
            ? childTitles.slice(0, 4).join(" → ")
            : (section.description ?? "尚未安排城市内地点")}
        </span>
        <span className="flex shrink-0 items-center text-[11px] font-black text-ink">
          进入城市
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </span>
    </button>
  )
}

function TransitSummaryCard({
  event,
  selected,
  onSelect,
}: {
  event: TransitEvent
  selected: boolean
  onSelect: () => void
}) {
  const plan = selectedTransitPlan(event)
  const label =
    event.detail.requestMode === "TRANSIT"
      ? "公共交通"
      : (transportLabels[event.detail.transportMode] ?? "交通")
  const details = plan
    ? `${label} ${formatTransitDuration(plan.durationSeconds)}`
    : [
        label,
        event.detail.plannedDurationMinutes
          ? formatTransitDuration(event.detail.plannedDurationMinutes * 60)
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
  return (
    <button
      type="button"
      aria-label={`选择交通事件 ${event.title}`}
      aria-pressed={selected}
      onClick={onSelect}
      className={`ml-4 flex w-[calc(100%_-_16px)] items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${
        selected
          ? "border-russet bg-selected-soft"
          : "border-transparent bg-route-blue-soft hover:border-bluegray/30"
      }`}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-bluegray">
        {event.detail.planningStatus === "PLANNING" ? (
          <LoaderCircle className="h-2.5 w-2.5 animate-spin text-soft-white" />
        ) : event.detail.planningStatus === "FAILED" ? (
          <AlertCircle className="h-2.5 w-2.5 text-soft-white" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] font-black text-bluegray">
        {event.detail.planningStatus === "PLANNING"
          ? "正在规划真实路线"
          : details}
      </span>
    </button>
  )
}
