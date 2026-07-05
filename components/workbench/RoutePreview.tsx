"use client"

import { getActivePathView } from "@/lib/routes/active-path"
import { sortPathEdgesByOrder, sortPathNodes } from "@/lib/routes/path-graph"
import { useMapStore } from "@/stores/mapStore"
import type { PathEdge, PathNode } from "@/types/route"

const categoryLabels: Record<string, string> = {
  CITY: "城市",
  PLACE: "地点",
  SIGHT: "景点",
  RESTAURANT: "餐饮",
  HOTEL: "住宿",
  ACTIVITY: "活动",
  TRANSIT: "中转",
}

const transportLabels: Record<string, string> = {
  FLIGHT: "飞机",
  TRAIN: "火车",
  CAR: "驾车",
  BUS: "巴士",
  WALK: "步行",
  TAXI: "出租车",
  SUBWAY: "地铁",
  RENTAL: "租车",
}

function formatDuration(minutes?: number) {
  if (minutes === undefined) return null
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} 小时`
  const days = Math.round(hours / 24)
  return `${days} 天`
}

function formatNumber(value?: number, suffix = "") {
  if (value === undefined) return null
  return `${Number.isInteger(value) ? value : value.toFixed(1)}${suffix}`
}

function statusLabel(status: PathEdge["status"]) {
  return status === "PLANNED" ? "已规划" : "待补全"
}

function NodeCard({
  node,
  index,
  edges,
  subPlanCount,
  onSelect,
}: {
  node: PathNode
  index: number
  edges: PathEdge[]
  subPlanCount?: number
  onSelect: () => void
}) {
  const duration = formatDuration(node.durationMinutes)
  const relatedStatuses = edges
    .filter((edge) => edge.fromNodeId === node.id || edge.toNodeId === node.id)
    .map((edge) => statusLabel(edge.status))

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-lg border border-[rgb(44_36_22_/_12%)] bg-[var(--periplus-white)] p-3 text-left shadow-[0_8px_18px_rgb(44_36_22_/_5%)] transition hover:border-[var(--periplus-russet)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-[var(--periplus-ink)]">
            {index + 1}. {node.name}
          </h3>
          <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs font-bold text-[var(--periplus-teak)]">
            <span>{categoryLabels[node.category] ?? node.category}</span>
            {duration && <span>{duration}</span>}
            {subPlanCount !== undefined && (
              <span>
                {subPlanCount > 0 ? `次级规划 ${subPlanCount} 节点` : "无次级规划"}
              </span>
            )}
          </div>
        </div>
        {relatedStatuses.length > 0 && (
          <span className="shrink-0 rounded-full bg-[rgb(44_36_22_/_7%)] px-2 py-1 text-[11px] font-bold text-[var(--periplus-walnut)]">
            {relatedStatuses.includes("待补全") ? "待补全" : "已规划"}
          </span>
        )}
      </div>
      {node.notes && (
        <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--periplus-walnut)]">
          {node.notes}
        </p>
      )}
    </button>
  )
}

function EdgeSummary({
  edge,
  onSelect,
}: {
  edge: PathEdge
  onSelect: () => void
}) {
  const details = [
    edge.transportMode ? transportLabels[edge.transportMode] : null,
    formatDuration(edge.durationMinutes),
    formatNumber(edge.distanceKm, " 公里"),
    formatNumber(edge.costEstimate, " 元"),
  ].filter(Boolean)

  return (
    <button
      type="button"
      onClick={onSelect}
      className="ml-4 flex w-[calc(100%-1rem)] items-center gap-2 py-3 text-left text-xs font-bold text-[var(--periplus-teak)] transition hover:text-[var(--periplus-ink)]"
    >
      <span
        className={`h-px flex-1 ${
          edge.status === "INCOMPLETE"
            ? "border-t border-dashed border-[var(--periplus-coral)]"
            : "bg-[rgb(44_36_22_/_20%)]"
        }`}
      />
      <span>{details.length ? details.join(" · ") : statusLabel(edge.status)}</span>
      <span>{statusLabel(edge.status)}</span>
      <span
        className={`h-px flex-1 ${
          edge.status === "INCOMPLETE"
            ? "border-t border-dashed border-[var(--periplus-coral)]"
            : "bg-[rgb(44_36_22_/_20%)]"
        }`}
      />
    </button>
  )
}

export default function RoutePreview() {
  const map = useMapStore((state) => state.map)
  const currentRoute = useMapStore((state) => state.currentRoute)
  const viewLevel = useMapStore((state) => state.viewLevel)
  const activeRouteNodeId = useMapStore((state) => state.activeRouteNodeId)
  const setSelectedLocationPoint = useMapStore(
    (state) => state.setSelectedLocationPoint
  )
  const setSelectedEdgeId = useMapStore((state) => state.setSelectedEdgeId)
  const view = getActivePathView(currentRoute, viewLevel, activeRouteNodeId)
  const nodes = sortPathNodes(view.nodes)
  const edges = sortPathEdgesByOrder(view.nodes, view.edges)
  const edgeByFromNodeId = new Map(edges.map((edge) => [edge.fromNodeId, edge]))

  const selectNode = (node: PathNode) => {
    setSelectedEdgeId(null)
    setSelectedLocationPoint(node)
    map?.setZoomAndCenter(
      view.level === "city" ? 15 : 8,
      new AMap.LngLat(node.lng, node.lat)
    )
  }

  const selectEdge = (edge: PathEdge) => {
    setSelectedLocationPoint(null)
    setSelectedEdgeId(edge.id)
    const fromNode = nodes.find((node) => node.id === edge.fromNodeId)
    const toNode = nodes.find((node) => node.id === edge.toNodeId)
    if (!map || !fromNode || !toNode) return

    const overlay = new AMap.Polyline({
      path: [
        new AMap.LngLat(fromNode.lng, fromNode.lat),
        new AMap.LngLat(toNode.lng, toNode.lat),
      ],
    })
    map.add(overlay)
    map.setFitView([overlay], false, [90, 90, 90, 460], 14)
    window.setTimeout(() => map.remove(overlay), 0)
  }

  if (!currentRoute) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-[var(--periplus-teak)]">
        暂无路线预览
      </div>
    )
  }

  return (
    <div className="space-y-4 px-5 pt-4 pb-5">
      <div>
        <h2 className="text-lg font-semibold text-[var(--periplus-ink)]">
          {view.title}
        </h2>
        <p className="mt-1 text-xs font-bold text-[var(--periplus-teak)]">
          {view.level === "overview" ? "顶层路线" : "次级路线"}
        </p>
      </div>

      {view.isEmptyCity && (
        <div className="rounded-lg border border-dashed border-[rgb(44_36_22_/_18%)] bg-[rgb(255_250_243_/_72%)] p-3 text-sm leading-6 text-[var(--periplus-walnut)]">
          暂无次级规划
        </div>
      )}

      <div>
        {nodes.map((node, index) => {
          const edge = edgeByFromNodeId.get(node.id)
          const subPlanCount =
            view.level === "overview"
              ? (currentRoute.subPlans.find(
                  (subPlan) => subPlan.routeNodeId === node.id
                )?.nodes.length ?? 0)
              : undefined

          return (
            <div key={node.id}>
              <NodeCard
                node={node}
                index={index}
                edges={edges}
                subPlanCount={subPlanCount}
                onSelect={() => selectNode(node)}
              />
              {edge && (
                <EdgeSummary edge={edge} onSelect={() => selectEdge(edge)} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
