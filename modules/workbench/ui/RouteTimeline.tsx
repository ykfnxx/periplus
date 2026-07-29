"use client"

import { useEffect, useRef } from "react"
import Image from "next/image"
import { BusFront, Car, Footprints, Plane, TrainFront } from "lucide-react"
import { matchPhotosToNode } from "@/lib/geo"
import {
  readyRouteCount,
  totalDurationMinutes,
} from "@/lib/routes/itinerary-summary"
import { selectedRoutePlan } from "@/lib/routes/planning"
import {
  formatRouteDistance,
  formatRouteDuration,
} from "@/lib/routes/route-display"
import { sortPathEdgesByOrder, sortPathNodes } from "@/lib/routes/path-graph"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type {
  PathEdge,
  PathNode,
  RouteNode,
  TransportMode,
} from "@/types/route"

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
  nodes,
  edges,
  routeNode,
}: {
  nodes: PathNode[]
  edges: PathEdge[]
  routeNode?: RouteNode | null
}) {
  const itemRefs = useRef(new Map<string, HTMLDivElement>())
  const photoShares = useWorkspaceStore((state) => state.photoShares)
  const selectedLocationPoint = useWorkspaceStore(
    (state) => state.selectedLocationPoint
  )
  const selectedEdgeId = useWorkspaceStore((state) => state.selectedEdgeId)
  const setSelectedLocationPoint = useWorkspaceStore(
    (state) => state.setSelectedLocationPoint
  )
  const setHoveredRouteNodeId = useWorkspaceStore(
    (state) => state.setHoveredRouteNodeId
  )
  const setSelectedEdgeId = useWorkspaceStore(
    (state) => state.setSelectedEdgeId
  )
  const selectRoutePlan = useWorkspaceStore((state) => state.selectRoutePlan)
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)

  const sortedNodes = sortPathNodes(nodes)
  const sortedEdges = sortPathEdgesByOrder(nodes, edges)
  const edgeByFromNodeId = new Map(
    sortedEdges.map((edge) => [edge.fromNodeId, edge])
  )
  const durationMinutes = totalDurationMinutes(sortedNodes)
  const routeDays = routeNode?.durationMinutes
    ? Math.max(1, Math.round(routeNode.durationMinutes / 1_440))
    : null

  useEffect(() => {
    if (!selectedLocationPoint) return
    itemRefs.current.get(selectedLocationPoint.id)?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    })
  }, [selectedLocationPoint])

  const selectNode = (node: PathNode) => {
    setSelectedEdgeId(null)
    setSelectedLocationPoint(node)
    requestMapFocus({
      type: "node",
      nodeId: node.id,
      zoom: 15,
    })
  }

  const selectEdge = (edge: PathEdge) => {
    setSelectedLocationPoint(null)
    const nextEdgeId = selectedEdgeId === edge.id ? null : edge.id
    setSelectedEdgeId(nextEdgeId)
    if (nextEdgeId) {
      requestMapFocus({
        type: "edge",
        edgeId: edge.id,
        maxZoom: 14,
      })
    }
  }

  return (
    <div className="px-5 pt-2 pb-5">
      <div className="mb-3 flex gap-2 overflow-x-auto pb-0.5">
        <span className="flex h-7 shrink-0 items-center rounded-full bg-russet px-4 text-[10px] font-black text-ink">
          全部行程
        </span>
        {routeDays ? (
          <span className="flex h-7 shrink-0 items-center rounded-full bg-cream px-4 text-[10px] font-black text-teak">
            共 {routeDays} 天
          </span>
        ) : null}
        <span className="flex h-7 shrink-0 items-center rounded-full bg-cream px-4 text-[10px] font-black text-teak">
          待安排
        </span>
      </div>

      <div className="rounded-[10px] border border-olive/20 bg-route-summary px-5 py-3.5">
        <p className="text-[11px] font-black text-ink">城市概览</p>
        <p className="mt-1 text-[18px] leading-6 font-black text-ink">
          {sortedNodes.length} 个地点
          {durationMinutes ? ` · ${formatCityDuration(durationMinutes)}` : ""}
        </p>
        <p className="mt-1 text-[10px] font-bold text-teak">
          {readyRouteCount(sortedEdges)}/{sortedEdges.length} 段真实路线 ·
          地图与卡片同步定位
        </p>
      </div>

      <div className="relative mt-5 pl-10">
        <div className="absolute top-4 bottom-4 left-[15px] w-0.5 bg-bluegray" />
        {sortedNodes.map((node, index) => {
          const edge = edgeByFromNodeId.get(node.id)
          const nodePhotos = photoShares
            ? matchPhotosToNode(node.lat, node.lng, photoShares)
            : []
          const selected = selectedLocationPoint?.id === node.id

          return (
            <div
              key={node.id}
              ref={(element) => {
                if (element) itemRefs.current.set(node.id, element)
                else itemRefs.current.delete(node.id)
              }}
              className="relative"
            >
              <button
                type="button"
                aria-label={`选择节点 ${node.name}`}
                aria-current={selected ? "true" : undefined}
                onClick={() => selectNode(node)}
                onMouseEnter={() => setHoveredRouteNodeId(node.id)}
                onMouseLeave={() => setHoveredRouteNodeId(null)}
                className={`mb-3 w-full rounded-[10px] border px-4 py-3 text-left transition ${
                  selected
                    ? "border-russet bg-selected-soft shadow-periplus-soft"
                    : "border-ink-10 bg-white hover:-translate-y-0.5 hover:border-russet"
                }`}
              >
                <span
                  className={`absolute top-3 -left-[39px] flex items-center justify-center rounded-full bg-route-blue text-[10px] font-black text-ink shadow-sm ${
                    selected
                      ? "h-8 w-8 border-4 border-russet"
                      : "h-6 w-6 border-[3px] border-white"
                  }`}
                >
                  {index + 1}
                </span>
                <span className="block text-[10px] font-black text-teak">
                  第 {index + 1} 站
                  {node.durationMinutes
                    ? ` · 建议停留 ${formatStayDuration(node.durationMinutes)}`
                    : ""}
                </span>
                <span className="mt-1 block text-base font-black text-ink">
                  {node.name}
                </span>
                {node.notes ? (
                  <span className="mt-1 block text-[12px] leading-5 text-walnut">
                    {node.notes}
                  </span>
                ) : null}
                {selected ? (
                  <span className="mt-3 inline-flex rounded-full bg-cream px-3 py-1 text-[10px] font-black text-teak">
                    当前已选中
                  </span>
                ) : null}
                {nodePhotos.length ? (
                  <span className="scrollbar-hidden mt-3 flex gap-2 overflow-x-auto">
                    {nodePhotos.map((photo) => (
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
              {edge ? (
                <EdgeTimelineRow
                  edge={edge}
                  selected={selectedEdgeId === edge.id}
                  onSelect={() => selectEdge(edge)}
                  onSelectPlan={(planId) => selectRoutePlan(edge.id, planId)}
                />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EdgeTimelineRow({
  edge,
  selected,
  onSelect,
  onSelectPlan,
}: {
  edge: PathEdge
  selected: boolean
  onSelect: () => void
  onSelectPlan: (planId: string) => void
}) {
  const plan = selectedRoutePlan(edge)
  const modeLabel =
    edge.requestMode === "TRANSIT"
      ? "公共交通"
      : transportLabels[edge.transportMode ?? "CAR"]
  const duration = plan?.durationSeconds
    ? formatRouteDuration(plan.durationSeconds)
    : edge.durationMinutes
      ? formatRouteDuration(edge.durationMinutes * 60)
      : null
  const distance = plan?.distanceMeters
    ? formatRouteDistance(plan.distanceMeters)
    : edge.distanceKm
      ? formatRouteDistance(edge.distanceKm * 1_000)
      : null

  return (
    <div className="relative mb-3">
      <span
        className={`absolute top-3 -left-[32px] flex h-4 w-4 items-center justify-center rounded-full border-2 border-soft-white ${
          selected ? "bg-russet" : "bg-bluegray"
        }`}
      >
        <TransportIcon mode={edge.transportMode} />
      </span>
      <button
        type="button"
        aria-label={`路线段 ${modeLabel}`}
        aria-pressed={selected}
        onClick={onSelect}
        className={`w-full rounded-lg border px-4 py-3 text-left transition ${
          selected
            ? "border-russet bg-selected-soft"
            : "border-transparent bg-route-blue-soft hover:border-bluegray/30"
        }`}
      >
        <span className="flex items-center gap-2">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-bluegray">
            <TransportIcon mode={edge.transportMode} />
          </span>
          <span className="text-[11px] font-black text-bluegray">
            {modeLabel} {[duration, distance].filter(Boolean).join(" · ")}
          </span>
        </span>
        {edge.planningStatus === "PLANNING" ? (
          <span className="mt-1.5 block pl-6 text-[10px] font-bold text-teak">
            正在规划真实路线
          </span>
        ) : null}
        {edge.planningStatus === "STALE" ? (
          <span className="mt-1.5 block pl-6 text-[10px] font-bold text-teak">
            正在更新路线，暂时显示上次结果
          </span>
        ) : null}
        {edge.planningWarning ? (
          <span className="mt-1.5 block pl-6 text-[10px] leading-4 font-bold text-coral">
            {edge.planningWarning}
          </span>
        ) : null}
      </button>
      {selected && (edge.plans?.length ?? 0) > 1 ? (
        <div className="mt-2 rounded-lg border border-ink-10 bg-white p-3">
          <p className="mb-2 text-[10px] font-black text-teak">路线方案</p>
          <div className="scrollbar-hidden flex gap-2 overflow-x-auto">
            {edge.plans!.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                aria-label={`选择${candidate.label}`}
                onClick={() => onSelectPlan(candidate.id)}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-black transition ${
                  plan?.id === candidate.id
                    ? "bg-russet text-ink"
                    : "bg-cream text-walnut hover:bg-ink hover:text-soft-white"
                }`}
              >
                {candidate.label} ·{" "}
                {formatRouteDuration(candidate.durationSeconds)}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TransportIcon({ mode }: { mode?: TransportMode }) {
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

function formatCityDuration(minutes: number) {
  if (minutes < 60) return `${minutes} 分钟`
  const hours = minutes / 60
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`
}
