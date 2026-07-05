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

export interface Route {
  id: string
  ownerId: string
  name: string
  description?: string
  nodes: RouteNode[]
  edges: RouteEdge[]
  subPlans: SubPlan[]
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
