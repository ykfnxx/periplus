import type { AuthContext } from "@/modules/auth/server/context"
import type {
  DraftJourney,
  Journey,
  JourneyEventCreateInput,
  JourneyEventPatchInput,
  JourneyEventPosition,
  JourneyInput,
} from "@/types/journey"

export interface JourneyCommandEnvelope {
  expectedRevision: number
  idempotencyKey: string
}

export interface JourneyAddEventInput extends JourneyCommandEnvelope {
  event: JourneyEventCreateInput
  position: JourneyEventPosition
}

export interface JourneyMoveEventInput extends JourneyCommandEnvelope {
  eventId: string
  position: JourneyEventPosition
}

export interface JourneyRemoveEventInput extends JourneyCommandEnvelope {
  eventId: string
  cascade?: boolean
}

export interface JourneyUpdateEventInput extends JourneyCommandEnvelope {
  eventId: string
  patch: JourneyEventPatchInput
}

export interface JourneyReplaceEventInput extends JourneyCommandEnvelope {
  eventId: string
  replacement: JourneyEventCreateInput
}

export interface JourneyLinkPlaceInput extends JourneyCommandEnvelope {
  eventId: string
  place: {
    placeId?: string
    name: string
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

export interface PlanTransitInput extends JourneyCommandEnvelope {
  eventId: string
}

export interface SelectTransitPlanInput extends PlanTransitInput {
  planId: string
}

export interface UndoJourneyInput extends JourneyCommandEnvelope {
  steps?: number
}

export const JOURNEY_TOOL_NAMES = [
  "get_current_journey",
  "replace_journey",
  "journey.add_event",
  "journey.move_event",
  "journey.remove_event",
  "journey.update_event",
  "journey.replace_event",
  "journey.link_place",
  "journey.plan_transit",
  "journey.select_transit_plan",
  "journey.undo",
] as const

export type JourneyToolName = (typeof JOURNEY_TOOL_NAMES)[number]

export function isJourneyToolName(value: unknown): value is JourneyToolName {
  return (
    typeof value === "string" &&
    JOURNEY_TOOL_NAMES.includes(value as JourneyToolName)
  )
}

export interface ToolCallSuggestionCall {
  tool: JourneyToolName
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

export interface DraftRevision {
  id: string
  revision: number
  operation: JourneyToolName | "draft.replace"
  eventId?: string
  idempotencyKey?: string
  before: DraftJourney | null
  after: DraftJourney | null
  createdAt: string
}

export type AgentConversationRole = "user" | "assistant"

export interface AgentConversationMessage {
  id: string
  role: AgentConversationRole
  content: string
  runId: string | null
  createdAt: string
  updatedAt: string
}

export interface SessionDraft {
  sessionId: string
  userContext: AuthContext | null
  document: DraftJourney | null
  sourceJourneyId: string | null
  baseRevision: number | null
  dirty: boolean
  lockedByRunId: string | null
  conversationMessages: AgentConversationMessage[]
  pendingSuggestions: ToolCallSuggestion[]
  revisions: DraftRevision[]
  revision: number
  updatedAt: string
}

export interface DraftSnapshot {
  sessionId: string
  document: DraftJourney | null
  sourceJourneyId: string | null
  baseRevision: number | null
  dirty: boolean
  isLocked: boolean
  lockedByRunId: string | null
  revision: number
  pendingSuggestions: ToolCallSuggestionSummary[]
  updatedAt: string
}

export type JourneyToolInput =
  | Record<string, never>
  | ({ journey: JourneyInput | Journey | null } & JourneyCommandEnvelope)
  | JourneyAddEventInput
  | JourneyMoveEventInput
  | JourneyRemoveEventInput
  | JourneyUpdateEventInput
  | JourneyReplaceEventInput
  | JourneyLinkPlaceInput
  | PlanTransitInput
  | SelectTransitPlanInput
  | UndoJourneyInput
