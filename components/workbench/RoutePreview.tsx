import { Car, Footprints, Plane } from "lucide-react"
import { haversineKm, matchPhotosToNode } from "@/lib/geo"
import { getActivePathView } from "@/lib/routes/active-path"
import { sortPathEdgesByOrder, sortPathNodes } from "@/lib/routes/path-graph"
import { useMapStore } from "@/stores/mapStore"
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
      <div className="absolute -left-[18px] top-1 h-4 w-4 rounded-full border-[3px] border-white bg-[var(--periplus-russet)]" />

      {/* Content */}
      <div>
        {duration && (
          <p className="text-[11px] text-[var(--periplus-teak)]">{duration}</p>
        )}
        <h3 className="text-sm font-bold text-[var(--periplus-ink)]">
          {node.name}
        </h3>
        {node.notes && (
          <p className="mt-0.5 text-xs text-[var(--periplus-walnut)]">
            {node.notes}
          </p>
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
}: {
  edge: PathEdge
  onSelect: () => void
}) {
  const details = [
    formatNumber(edge.distanceKm, " 公里"),
    formatDuration(edge.durationMinutes),
  ].filter(Boolean)

  return (
    <button
      type="button"
      aria-label={`路线段 ${edge.transportMode}`}
      onClick={onSelect}
      className="relative mb-5 w-full text-left"
    >
      {/* Timeline dot with icon */}
      <div className="absolute -left-[16px] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-[var(--periplus-bluegray)]">
        <TransportIcon mode={edge.transportMode} />
      </div>

      {/* Content */}
      <div>
        {details.length > 0 && (
          <p className="text-[11px] text-[var(--periplus-teak)]">
            {details.join(" · ")}
          </p>
        )}
        <p className="text-[13px] text-[var(--periplus-bluegray)]">
          {transportLabels[edge.transportMode ?? ""] ??
            (edge.transportMode || "驾车")}
        </p>
      </div>
    </button>
  )
}

export default function RoutePreview() {
  const map = useMapStore((state) => state.map)
  const currentRoute = useMapStore((state) => state.currentRoute)
  const viewLevel = useMapStore((state) => state.viewLevel)
  const activeRouteNodeId = useMapStore((state) => state.activeRouteNodeId)
  const photoShares = useMapStore((state) => state.photoShares)
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

      <div className="relative pl-7">
        {/* Vertical line */}
        <div className="absolute left-[10px] top-0 bottom-0 w-0.5 bg-[var(--periplus-bluegray)]" />

        {nodes.map((node) => {
          const edge = edgeByFromNodeId.get(node.id)
          const nodePhotos = matchPhotosToNode(node.lat, node.lng, photoShares)

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
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
