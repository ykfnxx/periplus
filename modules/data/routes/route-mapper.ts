import type {
  EdgeStatus,
  NodeCategory,
  RouteDto,
  RouteEdge,
  RouteNode,
  SubPlan,
  SubPlanEdge,
  SubPlanNode,
  TransportMode,
  RoutePreference,
  RouteRequestMode,
  RouteGeometryKind,
  RoutePlan,
  RouteSegmentMode,
  RouteTrafficBasis,
} from "@/types/route"

interface PathNodeRecord {
  id: string
  name: string
  lat: number
  lng: number
  placeId?: string | null
  coordinateSystem?: string | null
  coordinateProvider?: string | null
  providerPlaceId?: string | null
  order: number
  category: NodeCategory
  durationMinutes: number | null
  notes: string | null
  createdAt?: Date
  updatedAt?: Date
}

interface RouteNodeRecord extends PathNodeRecord {
  routeId: string
  subPlan?: SubPlanRecord | null
}

interface SubPlanNodeRecord extends PathNodeRecord {
  subPlanId: string
}

interface PathEdgeRecord {
  id: string
  fromNodeId: string
  toNodeId: string
  status: EdgeStatus
  transportMode: TransportMode | null
  durationMinutes: number | null
  distanceKm: number | null
  costEstimate: number | null
  notes: string | null
  requestMode?: RouteRequestMode | null
  departAt?: Date | null
  preference?: RoutePreference | null
  selectedPlanId?: string | null
  planningStatus?: string | null
  planningWarning?: string | null
  plans?: RoutePlanRecord[]
  createdAt?: Date
  updatedAt?: Date
}

interface RoutePlanRecord {
  id: string
  provider: string
  rank: number
  label: string
  strategy: string
  distanceMeters: number
  durationSeconds: number
  fareAmount: number | null
  trafficBasis: string
  calculatedAt: Date
  validUntil: Date | null
  requestFingerprint: string
  segments: RouteSegmentRecord[]
}

interface RouteSegmentRecord {
  id: string
  order: number
  mode: string
  fromName: string | null
  toName: string | null
  lineName: string | null
  distanceMeters: number | null
  durationSeconds: number | null
  fareAmount: number | null
  departAt: Date | null
  arriveAt: Date | null
  coordinateSystem: string
  geometryKind: string
  positionsJson: string
  trafficSectionsJson: string | null
}

interface RouteEdgeRecord extends PathEdgeRecord {
  routeId: string
}

interface SubPlanEdgeRecord extends PathEdgeRecord {
  subPlanId: string
}

interface SubPlanRecord {
  id: string
  routeNodeId: string
  nodes: SubPlanNodeRecord[]
  edges: SubPlanEdgeRecord[]
}

interface RouteRecord {
  id: string
  ownerId: string
  version: number
  visibility: string
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
  nodes: RouteNodeRecord[]
  edges: RouteEdgeRecord[]
}

function iso(date: Date | null | undefined) {
  return date?.toISOString()
}

function mapRouteNodeToDto(node: RouteNodeRecord): RouteNode {
  return {
    id: node.id,
    routeId: node.routeId,
    name: node.name,
    lat: node.lat,
    lng: node.lng,
    placeId: node.placeId ?? undefined,
    coordinateSystem: node.coordinateSystem ?? undefined,
    coordinateProvider: node.coordinateProvider ?? undefined,
    providerPlaceId: node.providerPlaceId ?? undefined,
    order: node.order,
    category: node.category,
    durationMinutes: node.durationMinutes ?? undefined,
    notes: node.notes ?? undefined,
    createdAt: iso(node.createdAt),
    updatedAt: iso(node.updatedAt),
  }
}

function mapSubPlanNodeToDto(node: SubPlanNodeRecord): SubPlanNode {
  return {
    id: node.id,
    subPlanId: node.subPlanId,
    name: node.name,
    lat: node.lat,
    lng: node.lng,
    placeId: node.placeId ?? undefined,
    coordinateSystem: node.coordinateSystem ?? undefined,
    coordinateProvider: node.coordinateProvider ?? undefined,
    providerPlaceId: node.providerPlaceId ?? undefined,
    order: node.order,
    category: node.category,
    durationMinutes: node.durationMinutes ?? undefined,
    notes: node.notes ?? undefined,
    createdAt: iso(node.createdAt),
    updatedAt: iso(node.updatedAt),
  }
}

function mapRouteEdgeToDto(edge: RouteEdgeRecord): RouteEdge {
  return {
    id: edge.id,
    routeId: edge.routeId,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    status: edge.status,
    transportMode: edge.transportMode ?? undefined,
    durationMinutes: edge.durationMinutes ?? undefined,
    distanceKm: edge.distanceKm ?? undefined,
    costEstimate: edge.costEstimate ?? undefined,
    notes: edge.notes ?? undefined,
    requestMode: edge.requestMode ?? undefined,
    departAt: iso(edge.departAt),
    preference: edge.preference ?? undefined,
    selectedPlanId: edge.selectedPlanId ?? undefined,
    planningStatus: edge.planningStatus as
      | RouteEdge["planningStatus"]
      | undefined,
    planningWarning: edge.planningWarning ?? undefined,
    planningFingerprint: edge.plans?.[0]?.requestFingerprint,
    plans: edge.plans?.map(mapRoutePlanToDto),
    createdAt: iso(edge.createdAt),
    updatedAt: iso(edge.updatedAt),
  }
}

function mapSubPlanEdgeToDto(edge: SubPlanEdgeRecord): SubPlanEdge {
  return {
    id: edge.id,
    subPlanId: edge.subPlanId,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    status: edge.status,
    transportMode: edge.transportMode ?? undefined,
    durationMinutes: edge.durationMinutes ?? undefined,
    distanceKm: edge.distanceKm ?? undefined,
    costEstimate: edge.costEstimate ?? undefined,
    notes: edge.notes ?? undefined,
    requestMode: edge.requestMode ?? undefined,
    departAt: iso(edge.departAt),
    preference: edge.preference ?? undefined,
    selectedPlanId: edge.selectedPlanId ?? undefined,
    planningStatus: edge.planningStatus as
      | SubPlanEdge["planningStatus"]
      | undefined,
    planningWarning: edge.planningWarning ?? undefined,
    planningFingerprint: edge.plans?.[0]?.requestFingerprint,
    plans: edge.plans?.map(mapRoutePlanToDto),
    createdAt: iso(edge.createdAt),
    updatedAt: iso(edge.updatedAt),
  }
}

function mapRoutePlanToDto(plan: RoutePlanRecord): RoutePlan {
  return {
    id: plan.id,
    provider: plan.provider as RoutePlan["provider"],
    rank: plan.rank,
    label: plan.label,
    strategy: plan.strategy,
    distanceMeters: plan.distanceMeters,
    durationSeconds: plan.durationSeconds,
    fareAmount: plan.fareAmount ?? undefined,
    trafficBasis: plan.trafficBasis as RouteTrafficBasis,
    calculatedAt: plan.calculatedAt.toISOString(),
    validUntil: iso(plan.validUntil),
    requestFingerprint: plan.requestFingerprint,
    segments: plan.segments.map((segment) => ({
      id: segment.id,
      order: segment.order,
      mode: segment.mode as RouteSegmentMode,
      fromName: segment.fromName ?? undefined,
      toName: segment.toName ?? undefined,
      lineName: segment.lineName ?? undefined,
      distanceMeters: segment.distanceMeters ?? undefined,
      durationSeconds: segment.durationSeconds ?? undefined,
      fareAmount: segment.fareAmount ?? undefined,
      departAt: iso(segment.departAt),
      arriveAt: iso(segment.arriveAt),
      coordinateSystem: "GCJ02",
      geometryKind: segment.geometryKind as RouteGeometryKind,
      positions: parseJson(segment.positionsJson, []),
      trafficSections: segment.trafficSectionsJson
        ? parseJson(segment.trafficSectionsJson, [])
        : undefined,
    })),
  }
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function mapSubPlanToDto(subPlan: SubPlanRecord): SubPlan {
  return {
    id: subPlan.id,
    routeNodeId: subPlan.routeNodeId,
    nodes: subPlan.nodes.map(mapSubPlanNodeToDto),
    edges: subPlan.edges.map(mapSubPlanEdgeToDto),
  }
}

export function mapRouteToDto(route: RouteRecord): RouteDto {
  return {
    id: route.id,
    ownerId: route.ownerId,
    version: route.version,
    visibility:
      route.visibility === "unlisted" || route.visibility === "public"
        ? route.visibility
        : "private",
    name: route.name,
    description: route.description ?? undefined,
    createdAt: route.createdAt.toISOString(),
    updatedAt: route.updatedAt.toISOString(),
    nodes: route.nodes.map(mapRouteNodeToDto),
    edges: route.edges.map(mapRouteEdgeToDto),
    subPlans: route.nodes
      .map((node) => node.subPlan)
      .filter((subPlan): subPlan is SubPlanRecord => Boolean(subPlan))
      .map(mapSubPlanToDto),
  }
}
