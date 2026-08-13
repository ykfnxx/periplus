"use client"

import { ChevronRight } from "lucide-react"
import {
  getJourneyScopeProjection,
  getJourneyScopeTreeEvents,
} from "@/lib/journeys/projections"
import {
  formatTransitDistance,
  formatTransitDuration,
} from "@/lib/journeys/display"
import {
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
import { selectWorkspaceJourneyView } from "@/modules/workspace/state/selectors"

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

export default function RouteOverview({
  changedEventIds = [],
}: {
  changedEventIds?: readonly string[]
}) {
  const graph = useWorkspaceStore(selectWorkspaceJourneyView)
  const enterSectionView = useWorkspaceStore((state) => state.enterSectionView)
  const selectedTransitEventId = useWorkspaceStore(
    (state) => state.selectedTransitEventId
  )
  const setSelectedTransitEventId = useWorkspaceStore(
    (state) => state.setSelectedTransitEventId
  )
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)
  const changedEventIdSet = new Set(changedEventIds)

  if (!graph) return null
  const sequence = getJourneyScopeProjection(graph, "overview", null)
  const sections = sequence.items.filter(
    (item): item is typeof item & { event: SectionEvent } =>
      item.event.type === "SECTION"
  )
  const journeyEvents = getJourneyScopeTreeEvents(graph, "overview", null)
  const journeyTransits = journeyEvents.filter(
    (event): event is TransitEvent => event.type === "TRANSIT"
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
          {totalDurationDays(journeyEvents) ? (
            <span>· {totalDurationDays(journeyEvents)} 天</span>
          ) : null}
          {totalTransitDistanceMeters(
            journeyEvents,
            graph.transitPlanningRuns
          ) ? (
            <span>
              ·{" "}
              {formatTransitDistance(
                totalTransitDistanceMeters(
                  journeyEvents,
                  graph.transitPlanningRuns
                )
              )}
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-[10px] font-bold text-teak">
          {locationCount(journeyEvents)} 个地点 ·
          {readyTransitCount(journeyEvents)}/{journeyTransits.length}
          段真实路线（含城市内）
        </p>
      </div>

      <div className="space-y-2.5">
        {sequence.items.map(({ event, resolved }) =>
          event.type === "SECTION" ? (
            <SectionSummaryCard
              key={event.id}
              section={event}
              locationOrdinal={resolved.locationOrdinal}
              childItems={getJourneyScopeProjection(
                graph,
                "section",
                event.id
              ).items.filter((child) => child.event.type !== "TRANSIT")}
              changed={getJourneyScopeProjection(
                graph,
                "section",
                event.id
              ).events.some((child) => changedEventIdSet.has(child.id))}
              onSelect={() => openSection(event.id)}
            />
          ) : event.type === "TRANSIT" ? (
            <TransitSummaryCard
              key={event.id}
              event={event}
              selected={selectedTransitEventId === event.id}
              changed={changedEventIdSet.has(event.id)}
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
  childItems,
  changed,
  onSelect,
}: {
  section: SectionEvent
  locationOrdinal?: number
  childItems: Array<{ resolved: { title: string } }>
  changed: boolean
  onSelect: () => void
}) {
  const childTitles = childItems.map((child) => child.resolved.title)
  return (
    <button
      type="button"
      aria-label={`查看城市 ${section.title}`}
      onClick={onSelect}
      className={`group relative w-full rounded-[10px] border bg-white px-5 py-4 text-left transition hover:-translate-y-0.5 hover:border-russet hover:shadow-periplus-soft ${
        changed ? "border-mustard ring-2 ring-mustard/25" : "border-ink-10"
      }`}
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
  changed,
  onSelect,
  planningRuns,
}: {
  event: TransitEvent
  selected: boolean
  changed: boolean
  onSelect: () => void
  planningRuns: readonly TargetTransitPlanningRun[]
}) {
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
    <div
      className={`ml-4 w-[calc(100%_-_16px)] rounded-lg border transition ${
        selected
          ? "border-russet bg-selected-soft"
          : changed
            ? "border-mustard bg-route-blue-soft ring-2 ring-mustard/25"
            : "border-transparent bg-route-blue-soft hover:border-bluegray/30"
      }`}
      data-selected-plan-id={plan?.id}
    >
      <button
        type="button"
        aria-label={`选择交通事件 ${event.title}`}
        aria-pressed={selected}
        onClick={onSelect}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left"
      >
        <span className="h-4 w-4 shrink-0 rounded-full bg-bluegray" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-black text-bluegray">
          {details}
        </span>
      </button>
    </div>
  )
}
