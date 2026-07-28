export const EDGE_STATUSES = ["PLANNED", "INCOMPLETE"] as const
export type EdgeStatus = (typeof EDGE_STATUSES)[number]

export const TRANSPORT_MODES = [
  "FLIGHT",
  "TRAIN",
  "CAR",
  "BUS",
  "WALK",
  "TAXI",
  "SUBWAY",
  "RENTAL",
] as const
export type TransportMode = (typeof TRANSPORT_MODES)[number]

export const ROUTE_REQUEST_MODES = ["DRIVE", "WALK", "TRANSIT"] as const
export type RouteRequestMode = (typeof ROUTE_REQUEST_MODES)[number]

export const ROUTE_PREFERENCES = [
  "RECOMMENDED",
  "FASTEST",
  "LOW_COST",
  "FEWER_TRANSFERS",
  "LESS_WALKING",
] as const
export type RoutePreference = (typeof ROUTE_PREFERENCES)[number]

export const ROUTE_PLANNING_STATUSES = [
  "EMPTY",
  "PLANNING",
  "READY",
  "STALE",
  "FAILED",
] as const
export type RoutePlanningStatus = (typeof ROUTE_PLANNING_STATUSES)[number]

export const ROUTE_TRAFFIC_BASES = [
  "REALTIME",
  "PREDICTED",
  "TYPICAL",
  "SCHEDULED",
] as const
export type RouteTrafficBasis = (typeof ROUTE_TRAFFIC_BASES)[number]

export const ROUTE_SEGMENT_MODES = [
  "WALK",
  "DRIVE",
  "BUS",
  "SUBWAY",
  "RAIL",
  "TAXI",
  "FLIGHT",
] as const
export type RouteSegmentMode = (typeof ROUTE_SEGMENT_MODES)[number]

export const ROUTE_GEOMETRY_KINDS = [
  "ROAD_NETWORK",
  "TRANSIT_LINE",
  "SCHEMATIC",
  "NONE",
] as const
export type RouteGeometryKind = (typeof ROUTE_GEOMETRY_KINDS)[number]

export type RouteLngLat = [number, number]

export interface RouteTrafficSection {
  status: "UNKNOWN" | "FREE_FLOW" | "SLOW" | "CONGESTED" | "SEVERE"
  positions: RouteLngLat[]
}

export interface RouteSegment {
  id: string
  order: number
  mode: RouteSegmentMode
  fromName?: string
  toName?: string
  lineName?: string
  distanceMeters?: number
  durationSeconds?: number
  fareAmount?: number
  departAt?: string
  arriveAt?: string
  coordinateSystem: "GCJ02"
  geometryKind: RouteGeometryKind
  positions: RouteLngLat[]
  trafficSections?: RouteTrafficSection[]
}

export interface RoutePlan {
  id: string
  provider: "amap" | "mock"
  rank: number
  label: string
  strategy: string
  distanceMeters: number
  durationSeconds: number
  fareAmount?: number
  trafficBasis: RouteTrafficBasis
  calculatedAt: string
  validUntil?: string
  requestFingerprint: string
  segments: RouteSegment[]
}

export const NODE_CATEGORIES = [
  "CITY",
  "PLACE",
  "SIGHT",
  "RESTAURANT",
  "HOTEL",
  "ACTIVITY",
  "TRANSIT",
] as const
export type NodeCategory = (typeof NODE_CATEGORIES)[number]

export interface PathNode {
  id: string
  name: string
  lat: number
  lng: number
  placeId?: string
  coordinateSystem?: string
  coordinateProvider?: string
  providerPlaceId?: string
  order: number
  category: NodeCategory
  durationMinutes?: number
  notes?: string
  createdAt?: string
  updatedAt?: string
}

export interface RouteNode extends PathNode {
  routeId?: string
}

export interface SubPlanNode extends PathNode {
  subPlanId?: string
}

export interface PathEdge {
  id: string
  fromNodeId: string
  toNodeId: string
  status: EdgeStatus
  transportMode?: TransportMode
  durationMinutes?: number
  distanceKm?: number
  costEstimate?: number
  notes?: string
  requestMode?: RouteRequestMode
  departAt?: string
  preference?: RoutePreference
  planningStatus?: RoutePlanningStatus
  planningFingerprint?: string
  planningWarning?: string
  selectedPlanId?: string
  plans?: RoutePlan[]
  createdAt?: string
  updatedAt?: string
}

export interface RouteEdge extends PathEdge {
  routeId?: string
}

export interface SubPlanEdge extends PathEdge {
  subPlanId?: string
}

export interface SubPlan {
  id: string
  routeNodeId: string
  nodes: SubPlanNode[]
  edges: SubPlanEdge[]
}

export interface RouteDocument {
  name: string
  description?: string
  nodes: RouteNode[]
  edges: RouteEdge[]
  subPlans: SubPlan[]
}

export interface DraftRoute extends RouteDocument {
  // Draft 内部 ID 只用于稳定标识节点/路径归属，不可用于分享或持久化读取。
  id: string
}

export const ROUTE_VISIBILITIES = ["private", "unlisted", "public"] as const
export type RouteVisibility = (typeof ROUTE_VISIBILITIES)[number]

export interface Route extends RouteDocument {
  id: string
  ownerId: string
  version: number
  visibility: RouteVisibility
  createdAt: string
  updatedAt: string
}

export type PathNodeInput = PathNode
export interface RouteNodeInput extends PathNodeInput {
  routeId?: string
}
export interface SubPlanNodeInput extends PathNodeInput {
  subPlanId?: string
}

export type PathEdgeInput = PathEdge
export interface RouteEdgeInput extends PathEdgeInput {
  routeId?: string
}
export interface SubPlanEdgeInput extends PathEdgeInput {
  subPlanId?: string
}

export interface SubPlanInput {
  id: string
  routeNodeId: string
  nodes: SubPlanNodeInput[]
  edges: SubPlanEdgeInput[]
}

export interface RouteInput {
  id?: string
  ownerId?: string
  name: string
  description?: string
  nodes: RouteNodeInput[]
  edges: RouteEdgeInput[]
  subPlans?: SubPlanInput[]
}

export interface PathNodeCreateInput {
  id?: string
  name: string
  lat: number
  lng: number
  placeId?: string
  coordinateSystem?: string
  coordinateProvider?: string
  providerPlaceId?: string
  category: NodeCategory
  durationMinutes?: number
  notes?: string
}

export type RouteNodeCreateInput = PathNodeCreateInput
export type SubPlanNodeCreateInput = PathNodeCreateInput

export interface PathNodePatchInput {
  name?: string
  lat?: number
  lng?: number
  placeId?: string | null
  coordinateSystem?: string | null
  coordinateProvider?: string | null
  providerPlaceId?: string | null
  category?: NodeCategory
  durationMinutes?: number | null
  notes?: string | null
}

export type RouteNodePatchInput = PathNodePatchInput
export type SubPlanNodePatchInput = PathNodePatchInput

export interface PathEdgeCreateInput {
  id?: string
  fromNodeId?: string
  toNodeId?: string
  status: EdgeStatus
  transportMode?: TransportMode
  durationMinutes?: number
  distanceKm?: number
  costEstimate?: number
  notes?: string
  requestMode?: RouteRequestMode
  departAt?: string
  preference?: RoutePreference
}

export type RouteEdgeCreateInput = PathEdgeCreateInput
export type SubPlanEdgeCreateInput = PathEdgeCreateInput

export interface PathEdgePatchInput {
  status?: EdgeStatus
  transportMode?: TransportMode | null
  durationMinutes?: number | null
  distanceKm?: number | null
  costEstimate?: number | null
  notes?: string | null
  requestMode?: RouteRequestMode | null
  departAt?: string | null
  preference?: RoutePreference | null
  selectedPlanId?: string | null
}

export type RouteEdgePatchInput = PathEdgePatchInput
export type SubPlanEdgePatchInput = PathEdgePatchInput

export type PathNodePosition =
  | { placement: "start" }
  | { placement: "end" }
  | { placement: "before"; nodeId: string }
  | { placement: "after"; nodeId: string }

export type RouteNodePosition = PathNodePosition
export type SubPlanNodePosition = PathNodePosition

export type CreateRouteInput = RouteInput
export type UpdateRouteInput = RouteInput
export type RouteDto = Route
