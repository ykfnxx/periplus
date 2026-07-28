import { Car, Footprints, Plane } from "lucide-react"
import { matchPhotosToNode } from "@/lib/geo"
import { getActivePathView } from "@/lib/routes/active-path"
import { selectedRoutePlan } from "@/lib/routes/planning"
import { sortPathEdgesByOrder, sortPathNodes } from "@/lib/routes/path-graph"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { PathEdge, PathNode, TransportMode } from "@/types/route"

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

function TransportIcon({ mode }: { mode?: TransportMode }) {
  const className = "h-2 w-2 text-white"
  if (mode === "FLIGHT") return <Plane className={className} />
  if (mode === "WALK") return <Footprints className={className} />
  return <Car className={className} />
}

function NodeItem({
  node,
  photos,
  onSelect,
}: {
  node: PathNode
  photos: Array<{ id: string; url: string }>
  onSelect: () => void
}) {
  const duration = formatDuration(node.durationMinutes)

  return (
    <button
      type="button"
      aria-label={`选择节点 ${node.name}`}
      onClick={onSelect}
      className="relative mb-5 w-full text-left"
    >
      {/* Timeline dot */}
      <div className="absolute top-1 -left-[18px] h-4 w-4 rounded-full border-[3px] border-white bg-russet" />

      {/* Content */}
      <div>
        {duration && <p className="text-[11px] text-teak">{duration}</p>}
        <h3 className="text-sm font-bold text-ink">{node.name}</h3>
        {node.notes && (
          <p className="mt-0.5 text-xs text-walnut">{node.notes}</p>
        )}
        {photos.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-lg"
              >
                <img
                  src={photo.url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </button>
  )
}

function EdgeItem({
  edge,
  onSelect,
  onSelectPlan,
}: {
  edge: PathEdge
  onSelect: () => void
  onSelectPlan: (planId: string) => void
}) {
  const details = [
    formatNumber(edge.distanceKm, " 公里"),
    formatDuration(edge.durationMinutes),
  ].filter(Boolean)

  const selected = selectedRoutePlan(edge)

  return (
    <div className="relative mb-5 w-full text-left">
      {/* Timeline dot with icon */}
      <div className="absolute top-1 -left-[16px] flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-bluegray">
        <TransportIcon mode={edge.transportMode} />
      </div>

      {/* Content */}
      <button
        type="button"
        aria-label={`路线段 ${edge.transportMode}`}
        onClick={onSelect}
        className="block w-full text-left"
      >
        {details.length > 0 && (
          <p className="text-[11px] text-teak">{details.join(" · ")}</p>
        )}
        <p className="text-[13px] text-bluegray">
          {edge.requestMode === "TRANSIT"
            ? "公共交通"
            : (transportLabels[edge.transportMode ?? ""] ??
              (edge.transportMode || "驾车"))}
        </p>
        {edge.planningStatus === "PLANNING" && (
          <p className="mt-0.5 text-[11px] text-teak">正在规划真实路线</p>
        )}
        {edge.planningWarning && (
          <p className="mt-1 text-[11px] leading-4 text-coral">
            {edge.planningWarning}
          </p>
        )}
      </button>
      {(edge.plans?.length ?? 0) > 1 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
          {edge.plans!.map((plan) => (
            <button
              key={plan.id}
              type="button"
              aria-label={`选择${plan.label}`}
              onClick={() => onSelectPlan(plan.id)}
              className={`shrink-0 rounded-md border px-2 py-1 text-[10px] font-bold transition ${
                selected?.id === plan.id
                  ? "border-russet bg-russet text-white"
                  : "border-ink-15 bg-soft-white text-walnut"
              }`}
            >
              {plan.label} ·{" "}
              {Math.max(1, Math.round(plan.durationSeconds / 60))} 分钟
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RoutePreview() {
  const draftRoute = useWorkspaceStore((state) => state.draftRoute)
  const viewLevel = useWorkspaceStore((state) => state.viewLevel)
  const activeRouteNodeId = useWorkspaceStore(
    (state) => state.activeRouteNodeId
  )
  const photoShares = useWorkspaceStore((state) => state.photoShares)
  const setSelectedLocationPoint = useWorkspaceStore(
    (state) => state.setSelectedLocationPoint
  )
  const setSelectedEdgeId = useWorkspaceStore(
    (state) => state.setSelectedEdgeId
  )
  const selectRoutePlan = useWorkspaceStore((state) => state.selectRoutePlan)
  const requestMapFocus = useWorkspaceStore((state) => state.requestMapFocus)
  const view = getActivePathView(draftRoute, viewLevel, activeRouteNodeId)
  const nodes = sortPathNodes(view.nodes)
  const edges = sortPathEdgesByOrder(view.nodes, view.edges)
  const edgeByFromNodeId = new Map(edges.map((edge) => [edge.fromNodeId, edge]))

  const selectNode = (node: PathNode) => {
    setSelectedEdgeId(null)
    setSelectedLocationPoint(node)
    requestMapFocus({
      type: "node",
      nodeId: node.id,
      zoom: view.level === "city" ? 15 : 8,
    })
  }

  const selectEdge = (edge: PathEdge) => {
    setSelectedLocationPoint(null)
    setSelectedEdgeId(edge.id)
    requestMapFocus({
      type: "edge",
      edgeId: edge.id,
      maxZoom: 14,
    })
  }

  if (!draftRoute) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-teak">
        暂无路线预览
      </div>
    )
  }

  return (
    <div className="space-y-4 px-5 pt-4 pb-5">
      <div>
        <h2 className="text-lg font-semibold text-ink">{view.title}</h2>
        <p className="mt-1 text-xs font-bold text-teak">
          {view.level === "overview" ? "顶层路线" : "次级路线"}
        </p>
      </div>

      {view.isEmptyCity && (
        <div className="rounded-lg border border-dashed border-ink-20 bg-soft-white/72 p-3 text-sm leading-6 text-walnut">
          暂无次级规划
        </div>
      )}

      <div className="relative pl-7">
        {/* Vertical line */}
        <div className="absolute top-0 bottom-0 left-[10px] w-0.5 bg-bluegray" />

        {nodes.map((node) => {
          const edge = edgeByFromNodeId.get(node.id)
          const nodePhotos = photoShares
            ? matchPhotosToNode(node.lat, node.lng, photoShares)
            : []

          return (
            <div key={node.id}>
              <NodeItem
                node={node}
                photos={nodePhotos}
                onSelect={() => selectNode(node)}
              />
              {edge && (
                <EdgeItem
                  key={edge.id}
                  edge={edge}
                  onSelect={() => selectEdge(edge)}
                  onSelectPlan={(planId) => selectRoutePlan(edge.id, planId)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
