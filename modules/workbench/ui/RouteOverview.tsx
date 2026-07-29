"use client"

import { AlertCircle, ChevronRight, LoaderCircle } from "lucide-react"
import { findRouteSubPlan } from "@/lib/routes/active-path"
import {
  readyRouteCount,
  totalDistanceMeters,
  totalDurationDays,
} from "@/lib/routes/itinerary-summary"
import { selectedRoutePlan } from "@/lib/routes/planning"
import {
  formatRouteDistance,
  formatRouteDuration,
} from "@/lib/routes/route-display"
import { sortPathEdgesByOrder, sortPathNodes } from "@/lib/routes/path-graph"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { PathEdge, RouteNode, TransportMode } from "@/types/route"

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
  const draftRoute = useWorkspaceStore((state) => state.draftRoute)
  const enterCityView = useWorkspaceStore((state) => state.enterCityView)
  const selectedEdgeId = useWorkspaceStore((state) => state.selectedEdgeId)
  const setSelectedEdgeId = useWorkspaceStore(
    (state) => state.setSelectedEdgeId
  )
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)

  if (!draftRoute) return null

  const nodes = sortPathNodes(draftRoute.nodes)
  const edges = sortPathEdgesByOrder(draftRoute.nodes, draftRoute.edges)
  const edgeByFromNodeId = new Map(edges.map((edge) => [edge.fromNodeId, edge]))
  const durationDays = totalDurationDays(nodes)
  const distanceMeters = totalDistanceMeters(edges)
  const realRouteCount = readyRouteCount(edges)
  const locationCount = draftRoute.subPlans.reduce(
    (total, subPlan) => total + subPlan.nodes.length,
    0
  )

  const openCity = (nodeId: string) => {
    enterCityView(nodeId)
    requestMapFocus({ type: "active-route", maxZoom: 15 })
  }

  const selectEdge = (edgeId: string) => {
    const nextEdgeId = selectedEdgeId === edgeId ? null : edgeId
    setSelectedEdgeId(nextEdgeId)
    if (nextEdgeId) {
      requestMapFocus({ type: "edge", edgeId, maxZoom: 12 })
    }
  }

  return (
    <div className="space-y-3 px-5 pt-2 pb-5">
      <div className="rounded-[10px] border border-olive/20 bg-route-summary px-5 py-3.5">
        <p className="text-[11px] font-black text-ink">行程摘要</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-1 text-[18px] leading-6 font-black text-ink">
          <span>{nodes.length} 个城市</span>
          {durationDays ? <span>· {durationDays} 天</span> : null}
          {distanceMeters ? (
            <span>· {formatRouteDistance(distanceMeters)}</span>
          ) : null}
        </p>
        <p className="mt-1 text-[10px] font-bold text-teak">
          {locationCount} 个地点 · {realRouteCount}/{edges.length} 段真实路线
        </p>
      </div>

      <div className="space-y-2.5">
        {nodes.map((node, index) => {
          const edge = edgeByFromNodeId.get(node.id)
          const placeNames =
            findRouteSubPlan(draftRoute, node.id)
              ?.nodes.toSorted((left, right) => left.order - right.order)
              .map((place) => place.name) ?? []

          return (
            <div key={node.id} className="space-y-2.5">
              <RouteScopeSummaryCard
                node={node}
                index={index}
                placeNames={placeNames}
                onSelect={() => openCity(node.id)}
              />
              {edge ? (
                <IntercityTransportCard
                  edge={edge}
                  fromName={node.name}
                  toName={
                    nodes.find((candidate) => candidate.id === edge.toNodeId)
                      ?.name ?? ""
                  }
                  selected={selectedEdgeId === edge.id}
                  onSelect={() => selectEdge(edge.id)}
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RouteScopeSummaryCard({
  node,
  index,
  placeNames,
  onSelect,
}: {
  node: RouteNode
  index: number
  placeNames: string[]
  onSelect: () => void
}) {
  const durationDays = node.durationMinutes
    ? Math.max(1, Math.round(node.durationMinutes / 1_440))
    : null

  return (
    <button
      type="button"
      aria-label={`查看城市 ${node.name}`}
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
          {node.name}
        </span>
        {durationDays ? (
          <span className="shrink-0 text-[11px] font-black text-teak">
            {durationDays} 天
          </span>
        ) : null}
      </span>
      <span className="mt-4 flex items-end justify-between gap-3 pl-1">
        <span className="min-w-0 truncate text-[13px] text-walnut">
          {placeNames.length
            ? placeNames.slice(0, 4).join(" → ")
            : (node.notes ?? "尚未安排城市内地点")}
        </span>
        <span className="flex shrink-0 items-center text-[11px] font-black text-ink">
          进入城市
          <ChevronRight
            className="h-3.5 w-3.5 transition group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
      </span>
    </button>
  )
}

function IntercityTransportCard({
  edge,
  fromName,
  toName,
  selected,
  onSelect,
}: {
  edge: PathEdge
  fromName: string
  toName: string
  selected: boolean
  onSelect: () => void
}) {
  const plan = selectedRoutePlan(edge)
  const details = plan
    ? `${transportLabel(edge)} ${formatRouteDuration(plan.durationSeconds)}`
    : fallbackRouteDetails(edge)

  return (
    <button
      type="button"
      aria-label={`选择路线段 ${fromName}到${toName}`}
      aria-pressed={selected}
      onClick={onSelect}
      className={`ml-4 flex w-[calc(100%_-_16px)] items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${
        selected
          ? "border-russet bg-selected-soft"
          : "border-transparent bg-route-blue-soft hover:border-bluegray/30"
      }`}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-bluegray">
        {edge.planningStatus === "PLANNING" ? (
          <LoaderCircle
            className="h-2.5 w-2.5 animate-spin text-soft-white"
            aria-hidden="true"
          />
        ) : edge.planningStatus === "FAILED" ? (
          <AlertCircle
            className="h-2.5 w-2.5 text-soft-white"
            aria-hidden="true"
          />
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] font-black text-bluegray">
        {fromName} → {toName} ·{" "}
        {edge.planningStatus === "PLANNING" ? "正在规划真实路线" : details}
      </span>
    </button>
  )
}

function transportLabel(edge: PathEdge) {
  return edge.requestMode === "TRANSIT"
    ? "公共交通"
    : (transportLabels[edge.transportMode ?? "CAR"] ?? "驾车")
}

function fallbackRouteDetails(edge: PathEdge) {
  const parts = [
    transportLabel(edge),
    edge.durationMinutes
      ? formatRouteDuration(edge.durationMinutes * 60)
      : null,
    edge.distanceKm ? formatRouteDistance(edge.distanceKm * 1_000) : null,
  ].filter(Boolean)
  return parts.join(" · ")
}
