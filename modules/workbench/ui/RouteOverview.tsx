"use client"

import { AlertCircle, ChevronRight, LoaderCircle } from "lucide-react"
import { getJourneyScopeProjection } from "@/lib/journeys/projections"
import {
  formatTransitDistance,
  formatTransitDuration,
} from "@/lib/journeys/display"
import {
  activeTransitPlanningRun,
  selectedTransitPlan,
  type TransportMode,
} from "@/lib/journeys/planning"
import {
  locationCount,
  readyTransitCount,
  totalDurationDays,
  totalTransitDistanceMeters,
} from "@/lib/journeys/summary"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type {
  TargetJourneyEvent,
  TargetTransitPlanningRun,
} from "@/modules/data-model/contracts"
import { selectWorkspaceGraph } from "@/modules/workspace/state/selectors"

type SectionEvent = Extract<TargetJourneyEvent, { type: "SECTION" }>
type TransitEvent = Extract<TargetJourneyEvent, { type: "TRANSIT" }>

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
  "bg-marker-orange text-ink",
  "bg-marker-mint text-ink",
  "bg-marker-yellow text-ink",
  "bg-marker-violet text-ink",
  "bg-coral text-soft-white",
  "bg-bluegray text-soft-white",
]

export default function RouteOverview() {
  const graph = useWorkspaceStore(selectWorkspaceGraph)
  const enterSectionView = useWorkspaceStore((state) => state.enterSectionView)
  const selectedTransitEventId = useWorkspaceStore(
    (state) => state.selectedTransitEventId
  )
  const setSelectedTransitEventId = useWorkspaceStore(
    (state) => state.setSelectedTransitEventId
  )
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)

  if (!graph) return null
  const sequence = getJourneyScopeProjection(graph, "overview", null)
  const sections = sequence.items.filter(
    (item): item is typeof item & { event: SectionEvent } =>
      item.event.type === "SECTION"
  )
  const transits = sequence.items.filter(
    (item): item is typeof item & { event: TransitEvent } =>
      item.event.type === "TRANSIT"
  )
  const childEvents = sections.flatMap(
    ({ event }) => getJourneyScopeProjection(graph, "section", event.id).events
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
          {totalTransitDistanceMeters(
            sequence.events,
            graph.transitPlanningRuns
          ) ? (
            <span>
              ·{" "}
              {formatTransitDistance(
                totalTransitDistanceMeters(
                  sequence.events,
                  graph.transitPlanningRuns
                )
              )}
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-[10px] font-bold text-teak">
          {locationCount(childEvents)} 个地点 ·
          {readyTransitCount(sequence.events)}/{transits.length} 段真实路线
        </p>
      </div>

      <div className="space-y-2.5">
        {sequence.items.map(({ event, resolved }) =>
          event.type === "SECTION" ? (
            <SectionSummaryCard
              key={event.id}
              section={event}
              locationOrdinal={resolved.locationOrdinal}
              childTitles={getJourneyScopeProjection(graph, "section", event.id)
                .items.filter((child) => child.event.type !== "TRANSIT")
                .map((child) => child.resolved.title)}
              onSelect={() => openSection(event.id)}
            />
          ) : event.type === "TRANSIT" ? (
            <TransitSummaryCard
              key={event.id}
              event={event}
              selected={selectedTransitEventId === event.id}
              onSelect={() => selectTransit(event.id)}
              planningRuns={graph.transitPlanningRuns}
            />
          ) : null
        )}
      </div>
    </div>
  )
}

function SectionSummaryCard({
  section,
  locationOrdinal,
  childTitles,
  onSelect,
}: {
  section: SectionEvent
  locationOrdinal?: number
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
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <span
            className={`inline-flex h-[20px] shrink-0 items-center rounded-[4px] px-2 text-[9px] font-black tracking-[0.08em] ${
              locationOrdinal === undefined
                ? "bg-bluegray text-soft-white"
                : markerClasses[(locationOrdinal - 1) % markerClasses.length]
            }`}
          >
            城市
          </span>
          <span className="truncate text-base font-black text-ink">
            {section.title}
          </span>
        </span>
        <span className="shrink-0 text-[11px] font-black text-teak">
          {childTitles.length} 项
        </span>
      </span>
      <span className="mt-4 flex items-end justify-between gap-3">
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
  planningRuns,
}: {
  event: TransitEvent
  selected: boolean
  onSelect: () => void
  planningRuns: readonly TargetTransitPlanningRun[]
}) {
  const activeRun = activeTransitPlanningRun(event, planningRuns)
  const plan = selectedTransitPlan(event, planningRuns)
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
        {activeRun?.status === "PLANNING" ? (
          <LoaderCircle className="h-2.5 w-2.5 animate-spin text-soft-white" />
        ) : activeRun?.status === "FAILED" ? (
          <AlertCircle className="h-2.5 w-2.5 text-soft-white" />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] font-black text-bluegray">
        {activeRun?.status === "PLANNING" ? "正在规划真实路线" : details}
      </span>
    </button>
  )
}
