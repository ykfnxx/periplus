"use client"

import { AlertCircle, ChevronRight, LoaderCircle } from "lucide-react"
import { findRouteSubPlan } from "@/lib/routes/active-path"
import { selectedRoutePlan } from "@/lib/routes/planning"
import {
  formatRouteDistance,
  formatRouteDuration,
} from "@/lib/routes/route-display"
import { sortPathEdgesByOrder, sortPathNodes } from "@/lib/routes/path-graph"
import { routeMarkerColors } from "@/lib/ui/map-theme"
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

export default function RouteOverview() {
  const draftRoute = useWorkspaceStore((state) => state.draftRoute)
  const enterCityView = useWorkspaceStore((state) => state.enterCityView)
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)

  if (!draftRoute) return null

  const nodes = sortPathNodes(draftRoute.nodes)
  const edges = sortPathEdgesByOrder(draftRoute.nodes, draftRoute.edges)
  const edgeByFromNodeId = new Map(edges.map((edge) => [edge.fromNodeId, edge]))

  const openCity = (nodeId: string) => {
    enterCityView(nodeId)
    requestMapFocus({ type: "active-route", maxZoom: 15 })
  }

  return (
    <div className="space-y-2.5 px-4 py-4">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-sm font-black text-ink">行程详情</h2>
        <p className="text-[11px] font-bold text-teak">
          {nodes.length} 个城市
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-ink-10 bg-white/45">
        {nodes.map((node, index) => (
          <RouteScopeSummaryRow
            key={node.id}
            node={node}
            edge={edgeByFromNodeId.get(node.id)}
            index={index}
            placeNames={
              findRouteSubPlan(draftRoute, node.id)?.nodes
                .toSorted((left, right) => left.order - right.order)
                .map((place) => place.name) ?? []
            }
            onSelect={() => openCity(node.id)}
          />
        ))}
      </div>
    </div>
  )
}

function RouteScopeSummaryRow({
  node,
  edge,
  index,
  placeNames,
  onSelect,
}: {
  node: RouteNode
  edge?: PathEdge
  index: number
  placeNames: string[]
  onSelect: () => void
}) {
  const selected = edge ? selectedRoutePlan(edge) : null
  const durationDays = node.durationMinutes
    ? Math.max(1, Math.round(node.durationMinutes / 1_440))
    : null
  const routeDetails = edge
    ? selected
      ? `${transportLabel(edge)} ${formatRouteDuration(
          selected.durationSeconds
        )} · ${formatRouteDistance(selected.distanceMeters)}`
      : fallbackRouteDetails(edge)
    : null

  return (
    <button
      type="button"
      aria-label={`查看城市 ${node.name}`}
      onClick={onSelect}
      className="group flex w-full items-start gap-3 border-b border-ink-10 px-3 py-3 text-left last:border-b-0 hover:bg-cream/65"
    >
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-soft-white text-xs font-black text-white shadow-sm"
        style={{
          background: routeMarkerColors[index % routeMarkerColors.length],
          color:
            index % routeMarkerColors.length === 2
              ? "var(--color-ink)"
              : "var(--color-white)",
        }}
      >
        {index + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[13px] font-black text-ink">
            {node.name}
          </span>
          {durationDays ? (
            <span className="text-[11px] font-bold text-teak">
              {durationDays} 天
            </span>
          ) : null}
        </span>
        <span className="mt-1 block truncate text-[11px] leading-5 text-walnut">
          {placeNames.length
            ? placeNames.slice(0, 4).join(" → ")
            : (node.notes ?? "尚未安排城市内地点")}
        </span>
        {routeDetails ? (
          <span className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-bluegray">
            {edge?.planningStatus === "PLANNING" ? (
              <LoaderCircle
                className="h-3 w-3 animate-spin"
                aria-hidden="true"
              />
            ) : edge?.planningStatus === "FAILED" ? (
              <AlertCircle className="h-3 w-3 text-coral" aria-hidden="true" />
            ) : null}
            {edge?.planningStatus === "PLANNING"
              ? "正在规划真实路线"
              : routeDetails}
          </span>
        ) : null}
      </span>
      <ChevronRight
        className="mt-2 h-4 w-4 shrink-0 text-teak transition group-hover:translate-x-0.5 group-hover:text-russet"
        aria-hidden="true"
      />
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
