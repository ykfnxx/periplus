import type { AuthContext } from "@/lib/auth-context"
import type {
  Route,
  RouteInput,
  RoutePointCreateInput,
  RoutePointPatchInput,
  RoutePointPosition,
} from "@/types/route"

export interface SessionDraft {
  sessionId: string
  userContext: AuthContext | null
  route: Route | null
  sourceRouteId: string | null
  lockedByRunId: string | null
  conversationMessages: AgentConversationMessage[]
  updatedAt: string
}

export interface DraftSnapshot {
  sessionId: string
  route: Route | null
  sourceRouteId: string | null
  isLocked: boolean
  lockedByRunId: string | null
  updatedAt: string
}

export type DraftToolName =
  | "get_current_draft"
  | "replace_draft"
  | "add_draft_point"
  | "update_draft_point"
  | "delete_draft_point"
  | "reorder_draft_points"

export type DraftToolInput =
  | Record<string, never>
  | { route: RouteInput | Route | null }
  | { point: RoutePointCreateInput; position?: RoutePointPosition }
  | {
      pointId: string
      patch?: RoutePointPatchInput
      position?: RoutePointPosition
    }
  | { pointId: string }
  | { pointIds: string[] }

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
