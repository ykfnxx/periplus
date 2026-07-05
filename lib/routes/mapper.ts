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
} from "@/types/route"

interface PathNodeRecord {
  id: string
  name: string
  lat: number
  lng: number
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
  createdAt?: Date
  updatedAt?: Date
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
  name: string
  description: string | null
  createdAt: Date
  updatedAt: Date
  nodes: RouteNodeRecord[]
  edges: RouteEdgeRecord[]
}

function iso(date: Date | undefined) {
  return date?.toISOString()
}

function mapRouteNodeToDto(node: RouteNodeRecord): RouteNode {
  return {
    id: node.id,
    routeId: node.routeId,
    name: node.name,
    lat: node.lat,
    lng: node.lng,
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
    createdAt: iso(edge.createdAt),
    updatedAt: iso(edge.updatedAt),
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
