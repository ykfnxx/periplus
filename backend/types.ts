export type { AgentConversationMessage } from "@/modules/workspace/server/contracts"

export type AgentMode = "auto" | "suggest"

export interface AgentEvent {
  type: string
  payload?: unknown
}

export type AgentEventEmitter = (sessionId: string, event: AgentEvent) => void
