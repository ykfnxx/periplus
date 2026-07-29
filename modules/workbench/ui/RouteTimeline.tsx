"use client"

import { useEffect, useRef } from "react"
import Image from "next/image"
import {
  BusFront,
  Car,
  Footprints,
  Plane,
  TrainFront,
} from "lucide-react"
import { matchPhotosToNode } from "@/lib/geo"
import { selectedRoutePlan } from "@/lib/routes/planning"
import {
  formatRouteDistance,
  formatRouteDuration,
} from "@/lib/routes/route-display"
import { sortPathEdgesByOrder, sortPathNodes } from "@/lib/routes/path-graph"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { PathEdge, PathNode, TransportMode } from "@/types/route"

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
}: {
  nodes: PathNode[]
  edges: PathEdge[]
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
    <div className="relative px-4 py-4 pl-12">
      <div className="absolute top-5 bottom-5 left-[27px] w-px bg-ink-15" />
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
              className={`mb-3 w-full rounded-xl border px-3 py-3 text-left transition ${
                selected
                  ? "border-russet bg-russet/8 shadow-sm"
                  : "border-transparent hover:border-ink-10 hover:bg-white/50"
              }`}
            >
              <span
                className={`absolute top-3 -left-[31px] flex h-7 w-7 items-center justify-center rounded-full border-[3px] border-soft-white text-xs font-black shadow-sm ${
                  selected ? "bg-russet text-white" : "bg-mustard text-ink"
                }`}
              >
                {index + 1}
              </span>
              <span className="block text-[13px] font-black text-ink">
                {node.name}
              </span>
              {node.durationMinutes ? (
                <span className="mt-0.5 block text-[10px] font-bold text-teak">
                  建议停留 {formatStayDuration(node.durationMinutes)}
                </span>
              ) : null}
              {node.notes ? (
                <span className="mt-1 block text-[11px] leading-5 text-walnut">
                  {node.notes}
                </span>
              ) : null}
              {nodePhotos.length ? (
                <span className="scrollbar-hidden mt-2 flex gap-2 overflow-x-auto">
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
        className={`absolute top-2 -left-[26px] flex h-4 w-4 items-center justify-center rounded-full border-2 border-soft-white ${
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
        className={`w-full rounded-lg border px-3 py-2 text-left transition ${
          selected
            ? "border-russet bg-russet/8"
            : "border-ink-10 bg-white/35 hover:bg-white/65"
        }`}
      >
        <span className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-black text-bluegray">
            {modeLabel}
          </span>
          <span className="text-[10px] font-bold text-teak">
            {[duration, distance].filter(Boolean).join(" · ")}
          </span>
        </span>
        {edge.planningStatus === "PLANNING" ? (
          <span className="mt-1 block text-[10px] font-bold text-teak">
            正在规划真实路线
          </span>
        ) : null}
        {edge.planningStatus === "STALE" ? (
          <span className="mt-1 block text-[10px] font-bold text-teak">
            正在更新路线，暂时显示上次结果
          </span>
        ) : null}
        {edge.planningWarning ? (
          <span className="mt-1 block text-[10px] leading-4 font-bold text-coral">
            {edge.planningWarning}
          </span>
        ) : null}
      </button>
      {selected && (edge.plans?.length ?? 0) > 1 ? (
        <div className="scrollbar-hidden mt-1.5 flex gap-1.5 overflow-x-auto">
          {edge.plans!.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              aria-label={`选择${candidate.label}`}
              onClick={() => onSelectPlan(candidate.id)}
              className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold transition ${
                plan?.id === candidate.id
                  ? "border-russet bg-russet text-white"
                  : "border-ink-15 bg-soft-white text-walnut"
              }`}
            >
              {candidate.label} ·{" "}
              {formatRouteDuration(candidate.durationSeconds)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function TransportIcon({ mode }: { mode?: TransportMode }) {
  const className = "h-2 w-2 text-white"
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
  if (minutes < 1_440) {
    const hours = Math.round(minutes / 60)
    return `${hours} 小时`
  }
  return `${Math.max(1, Math.round(minutes / 1_440))} 天`
}
