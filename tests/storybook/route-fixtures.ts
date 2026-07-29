import { silkRoadRoute } from "@/lib/mock-routes"
import type {
  DraftRoute,
  PathEdge,
  PathNode,
  RouteLngLat,
  RoutePlan,
} from "@/types/route"

export const silkRoadRouteWithPlans: DraftRoute = {
  ...silkRoadRoute,
  edges: attachPlans(silkRoadRoute.nodes, silkRoadRoute.edges),
  subPlans: silkRoadRoute.subPlans.map((subPlan) => ({
    ...subPlan,
    edges: attachPlans(subPlan.nodes, subPlan.edges),
  })),
}

function attachPlans<T extends PathEdge>(nodes: PathNode[], edges: T[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  return edges.map((edge, index) => {
    const from = nodeById.get(edge.fromNodeId)
    const to = nodeById.get(edge.toNodeId)
    if (!from || !to) return edge
    const plan = createPlan(edge, from, to, index)
    return {
      ...edge,
      planningStatus: "READY" as const,
      planningFingerprint: plan.requestFingerprint,
      selectedPlanId: plan.id,
      plans: [plan, createAlternativePlan(plan)],
      durationMinutes: Math.round(plan.durationSeconds / 60),
      distanceKm: Math.round(plan.distanceMeters / 100) / 10,
    }
  })
}

function createPlan(
  edge: PathEdge,
  from: PathNode,
  to: PathNode,
  index: number
): RoutePlan {
  const positions = routeFixturePositions(from, to, index)
  const distanceMeters = Math.max(
    1_200,
    Math.round(
      Math.hypot(to.lng - from.lng, to.lat - from.lat) * 91_000
    )
  )
  const durationSeconds = Math.round(distanceMeters / 19)
  const mode = edge.requestMode === "TRANSIT" ? "SUBWAY" : "DRIVE"

  return {
    id: `${edge.id}-recommended`,
    provider: "mock",
    rank: 0,
    label: "推荐方案",
    strategy: "recommended",
    distanceMeters,
    durationSeconds,
    trafficBasis: "TYPICAL",
    calculatedAt: "2026-07-29T00:00:00.000Z",
    requestFingerprint: `${edge.id}-fixture`,
    segments: [
      {
        id: `${edge.id}-segment`,
        order: 0,
        mode,
        distanceMeters,
        durationSeconds,
        coordinateSystem: "GCJ02",
        geometryKind:
          edge.requestMode === "TRANSIT" ? "TRANSIT_LINE" : "ROAD_NETWORK",
        positions,
      },
    ],
  }
}

function createAlternativePlan(plan: RoutePlan): RoutePlan {
  return {
    ...plan,
    id: `${plan.id}-alternative`,
    rank: 1,
    label: "少走拥堵",
    strategy: "less-congestion",
    distanceMeters: Math.round(plan.distanceMeters * 1.08),
    durationSeconds: Math.round(plan.durationSeconds * 1.12),
    requestFingerprint: `${plan.requestFingerprint}-alternative`,
    segments: plan.segments.map((segment) => ({
      ...segment,
      id: `${segment.id}-alternative`,
      positions: segment.positions.map(([lng, lat], index) => [
        lng + (index === 1 ? 0.025 : 0),
        lat + (index === 1 ? 0.018 : 0),
      ]),
    })),
  }
}

function routeFixturePositions(
  from: PathNode,
  to: PathNode,
  index: number
): RouteLngLat[] {
  const bend = index % 2 === 0 ? 0.08 : -0.06
  const deltaLng = to.lng - from.lng
  const deltaLat = to.lat - from.lat
  return [
    [from.lng, from.lat],
    [
      from.lng + deltaLng * 0.28,
      from.lat + deltaLat * 0.28 + bend,
    ],
    [
      from.lng + deltaLng * 0.62,
      from.lat + deltaLat * 0.62 - bend * 0.5,
    ],
    [to.lng, to.lat],
  ]
}
