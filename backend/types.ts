import type { AuthContext } from "@/lib/auth-context"
import type {
  PathEdgeCreateInput,
  PathEdgePatchInput,
  PathNodeCreateInput,
  PathNodePatchInput,
  Route,
  RouteInput,
} from "@/types/route"

export interface RouteAddStartNodeInput {
  route?: {
    name?: string
    description?: string
  }
  node: PathNodeCreateInput
}

export interface AppendNodeInput {
  node: PathNodeCreateInput
  edge: PathEdgeCreateInput
}

export interface InsertNodeInput {
  beforeNodeId: string
  node: PathNodeCreateInput
  beforeEdge?: PathEdgeCreateInput
  afterEdge: PathEdgeCreateInput
}

export interface RemoveNodeRangeInput {
  startNodeId: string
  endNodeId: string
  bridgeEdge?: PathEdgeCreateInput
}

export interface UpdateNodeInput {
  nodeId: string
  patch: PathNodePatchInput
}

export interface LinkPlaceToNodeInput {
  nodeId: string
  routeNodeId?: string
  place: {
    placeId?: string
    name: string
    category?: string
    address?: string
    providerPlaceId?: string
    coordinate: {
      lat: number
      lng: number
      coordinateSystem: string
      provider: string
    }
  }
}

export interface UpdateEdgeInput {
  edgeId?: string
  fromNodeId?: string
  toNodeId?: string
  patch: PathEdgePatchInput
}

export interface SubPlanCreateInput {
  routeNodeId: string
  subPlan?: {
    id?: string
    nodes?: Array<PathNodeCreateInput & { id?: string; order?: number }>
    edges?: Array<PathEdgeCreateInput & { id?: string }>
  }
}

export interface SubPlanNodeInput extends AppendNodeInput {
  routeNodeId: string
}

export interface SubPlanInsertNodeInput extends InsertNodeInput {
  routeNodeId: string
}

export interface SubPlanRemoveNodeRangeInput extends RemoveNodeRangeInput {
  routeNodeId: string
}

export interface SubPlanUpdateNodeInput extends UpdateNodeInput {
  routeNodeId: string
}

export interface SubPlanUpdateEdgeInput extends UpdateEdgeInput {
  routeNodeId: string
}

export type AgentMode = "auto" | "suggest"

export const DRAFT_TOOL_NAMES = [
  "get_current_draft",
  "replace_draft",
  "route.add_start_node",
  "route.append_node",
  "route.insert_node",
  "route.remove_node_range",
  "route.update_node",
  "route.update_edge",
  "route.link_place_to_node",
  "subplan.create",
  "subplan.add_start_node",
  "subplan.append_node",
  "subplan.insert_node",
  "subplan.remove_node_range",
  "subplan.update_node",
  "subplan.update_edge",
] as const

export type DraftToolName = (typeof DRAFT_TOOL_NAMES)[number]

export interface ToolCallSuggestionCall {
  tool: DraftToolName
  input: Record<string, unknown>
}

export interface ToolCallSuggestion {
  id: string
  title: string
  summary: string
  toolCalls: ToolCallSuggestionCall[]
  draftRevision: number
  createdAt: string
  updatedAt: string
}

export interface ToolCallSuggestionSummary {
  id: string
  title: string
  summary: string
  toolCallCount: number
  draftRevision: number
  createdAt: string
  updatedAt: string
}

export interface ToolCallSuggestionCreateInput {
  title: string
  summary: string
  toolCalls: ToolCallSuggestionCall[]
}

export interface SessionDraft {
  sessionId: string
  userContext: AuthContext | null
  route: Route | null
  sourceRouteId: string | null
  lockedByRunId: string | null
  conversationMessages: AgentConversationMessage[]
  pendingSuggestions: ToolCallSuggestion[]
  revision: number
  updatedAt: string
}

export interface DraftSnapshot {
  sessionId: string
  route: Route | null
  sourceRouteId: string | null
  isLocked: boolean
  lockedByRunId: string | null
  revision: number
  pendingSuggestions: ToolCallSuggestionSummary[]
  updatedAt: string
}

export type DraftToolInput =
  | Record<string, never>
  | { route: RouteInput | Route | null }
  | RouteAddStartNodeInput
  | AppendNodeInput
  | InsertNodeInput
  | RemoveNodeRangeInput
  | UpdateNodeInput
  | LinkPlaceToNodeInput
  | UpdateEdgeInput
  | SubPlanCreateInput
  | SubPlanNodeInput
  | SubPlanInsertNodeInput
  | SubPlanRemoveNodeRangeInput
  | SubPlanUpdateNodeInput
  | SubPlanUpdateEdgeInput

export interface AgentEvent {
  type: string
  payload?: unknown
}

export type AgentEventEmitter = (sessionId: string, event: AgentEvent) => void

export type AgentConversationRole = "user" | "assistant"

export interface AgentConversationMessage {
  id: string
  role: AgentConversationRole
  content: string
  runId: string | null
  createdAt: string
  updatedAt: string
}
