export interface AgentConversationMessage {
  id: string
  role: "user" | "assistant"
  content: string
  runId: string | null
  createdAt: string
  updatedAt: string
}

export type AgentMode = "auto" | "suggest"

export interface AgentEvent {
  type: string
  payload?: unknown
}

export type AgentEventEmitter = (workspaceId: string, event: AgentEvent) => void
