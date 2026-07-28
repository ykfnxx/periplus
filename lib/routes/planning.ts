import type {
  PathEdge,
  PathNode,
  RoutePlan,
  RoutePreference,
  RouteRequestMode,
  TransportMode,
  RouteDocument,
} from "@/types/route"

export type RouteProviderErrorCode =
  | "INVALID_ENDPOINT"
  | "NO_ROUTE"
  | "AUTH_OR_QUOTA"
  | "RATE_LIMIT"
  | "TIMEOUT"
  | "MALFORMED_RESPONSE"

export interface RoutePlanEndpoint {
  name: string
  lat: number
  lng: number
  coordinateSystem?: string
  providerPlaceId?: string
  cityCode?: string
}

export interface RoutePlanRequest {
  edgeId: string
  origin: RoutePlanEndpoint
  destination: RoutePlanEndpoint
  mode: RouteRequestMode
  departAt?: string
  preference: RoutePreference
  alternatives: number
}

export interface RoutePlanBundle {
  edgeId: string
  requestFingerprint: string
  plans: RoutePlan[]
  warning?: string
}

export interface RoutePlanFailure {
  edgeId: string
  code: RouteProviderErrorCode
  message: string
}

export function requestModeForTransport(
  transportMode?: TransportMode
): RouteRequestMode | null {
  if (transportMode === "WALK") return "WALK"
  if (
    transportMode === "BUS" ||
    transportMode === "SUBWAY" ||
    transportMode === "TRAIN"
  ) {
    return "TRANSIT"
  }
  if (
    transportMode === "CAR" ||
    transportMode === "TAXI" ||
    transportMode === "RENTAL"
  ) {
    return "DRIVE"
  }
  return null
}

export function buildRoutePlanRequest(
  edge: PathEdge,
  from: PathNode,
  to: PathNode
): RoutePlanRequest | null {
  const mode = edge.requestMode ?? requestModeForTransport(edge.transportMode)
  if (!mode) return null
  return {
    edgeId: edge.id,
    origin: {
      name: from.name,
      lat: from.lat,
      lng: from.lng,
      coordinateSystem: from.coordinateSystem,
      providerPlaceId:
        from.coordinateProvider?.toLowerCase() === "amap"
          ? from.providerPlaceId
          : undefined,
    },
    destination: {
      name: to.name,
      lat: to.lat,
      lng: to.lng,
      coordinateSystem: to.coordinateSystem,
      providerPlaceId:
        to.coordinateProvider?.toLowerCase() === "amap"
          ? to.providerPlaceId
          : undefined,
    },
    mode,
    departAt: edge.departAt,
    preference: edge.preference ?? "RECOMMENDED",
    alternatives: 3,
  }
}

export function routePlanFingerprint(request: RoutePlanRequest) {
  const normalized = {
    origin: endpointFingerprint(request.origin),
    destination: endpointFingerprint(request.destination),
    mode: request.mode,
    departAt: request.departAt ?? null,
    preference: request.preference,
    alternatives: request.alternatives,
  }
  return stableHash(JSON.stringify(normalized))
}

function stableHash(value: string) {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85ebca6b)
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`
}

function endpointFingerprint(endpoint: RoutePlanEndpoint) {
  return {
    lat: Math.round(endpoint.lat * 1e6) / 1e6,
    lng: Math.round(endpoint.lng * 1e6) / 1e6,
    coordinateSystem: endpoint.coordinateSystem ?? "GCJ02",
    providerPlaceId: endpoint.providerPlaceId ?? null,
    cityCode: endpoint.cityCode ?? null,
  }
}

export function selectedRoutePlan(edge: PathEdge) {
  if (!edge.plans?.length) return undefined
  return (
    edge.plans.find((plan) => plan.id === edge.selectedPlanId) ?? edge.plans[0]
  )
}

export function applyRoutePlanBundle(
  edge: PathEdge,
  bundle: RoutePlanBundle
): PathEdge {
  if (bundle.edgeId !== edge.id) return edge
  const selectedPlanId = bundle.plans.some(
    (plan) => plan.id === edge.selectedPlanId
  )
    ? edge.selectedPlanId
    : bundle.plans[0]?.id
  const selected =
    bundle.plans.find((plan) => plan.id === selectedPlanId) ?? bundle.plans[0]
  return {
    ...edge,
    plans: bundle.plans,
    selectedPlanId,
    planningFingerprint: bundle.requestFingerprint,
    planningStatus: bundle.plans.length ? "READY" : "FAILED",
    planningWarning: bundle.warning,
    durationMinutes: selected
      ? Math.max(1, Math.round(selected.durationSeconds / 60))
      : edge.durationMinutes,
    distanceKm: selected
      ? Math.round((selected.distanceMeters / 1000) * 10) / 10
      : edge.distanceKm,
    costEstimate: selected?.fareAmount ?? edge.costEstimate,
  }
}

export function mergeWorkspaceRoutePlans<T extends RouteDocument>(
  previous: T | null,
  incoming: T | null
): T | null {
  if (!previous || !incoming) return incoming
  return {
    ...incoming,
    edges: mergePathPlans(
      previous.nodes,
      previous.edges,
      incoming.nodes,
      incoming.edges
    ),
    subPlans: incoming.subPlans.map((subPlan) => {
      const old = previous.subPlans.find((item) => item.id === subPlan.id)
      return old
        ? {
            ...subPlan,
            edges: mergePathPlans(
              old.nodes,
              old.edges,
              subPlan.nodes,
              subPlan.edges
            ),
          }
        : subPlan
    }),
  } as T
}

function mergePathPlans<TEdge extends PathEdge>(
  previousNodes: PathNode[],
  previousEdges: TEdge[],
  incomingNodes: PathNode[],
  incomingEdges: TEdge[]
) {
  const oldById = new Map(previousEdges.map((edge) => [edge.id, edge]))
  const nodeById = new Map(incomingNodes.map((node) => [node.id, node]))
  return incomingEdges.map((edge) => {
    if (edge.plans?.length) return edge
    const old = oldById.get(edge.id)
    const from = nodeById.get(edge.fromNodeId)
    const to = nodeById.get(edge.toNodeId)
    if (!old?.plans?.length || !from || !to) return edge
    const request = buildRoutePlanRequest(edge, from, to)
    if (!request) return edge
    const currentFingerprint = routePlanFingerprint(request)
    return {
      ...edge,
      plans: old.plans,
      selectedPlanId: old.selectedPlanId,
      planningFingerprint: old.planningFingerprint,
      planningWarning: old.planningWarning,
      planningStatus:
        old.planningFingerprint === currentFingerprint ? "READY" : "STALE",
      durationMinutes: old.durationMinutes,
      distanceKm: old.distanceKm,
      costEstimate: old.costEstimate,
    }
  })
}
