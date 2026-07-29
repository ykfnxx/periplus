import { selectedRoutePlan } from "@/lib/routes/planning"
import type { PathEdge, PathNode } from "@/types/route"

export function totalDurationMinutes(nodes: PathNode[]) {
  return nodes.reduce((total, node) => total + (node.durationMinutes ?? 0), 0)
}

export function totalDurationDays(nodes: PathNode[]) {
  const minutes = totalDurationMinutes(nodes)
  return minutes ? Math.max(1, Math.round(minutes / 1_440)) : null
}

export function totalDistanceMeters(edges: PathEdge[]) {
  return edges.reduce((total, edge) => {
    const plan = selectedRoutePlan(edge)
    if (plan) return total + plan.distanceMeters
    return total + (edge.distanceKm ?? 0) * 1_000
  }, 0)
}

export function readyRouteCount(edges: PathEdge[]) {
  return edges.filter((edge) => {
    const plan = selectedRoutePlan(edge)
    return (
      edge.planningStatus === "READY" &&
      plan?.segments.some(
        (segment) =>
          segment.geometryKind !== "NONE" && segment.positions.length >= 2
      )
    )
  }).length
}
