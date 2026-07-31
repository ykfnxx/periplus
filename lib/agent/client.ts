import type { DraftJourney } from "@/types/journey"
import { periplusPublicConfig } from "@/config/periplus"

export interface ToolCallSuggestionSummary {
  id: string
  title: string
  summary: string
  toolCallCount: number
  draftRevision: number
  createdAt: string
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

export interface AgentEvent {
  type: string
  payload?: unknown
}

export interface AgentConversationMessage {
  id: string
  role: "user" | "assistant"
  content: string
  runId: string | null
  createdAt: string
  updatedAt: string
}

interface SessionResponse {
  sessionId: string
  draft: DraftSnapshot
  messages: AgentConversationMessage[]
}

export const agentBackendUrl = periplusPublicConfig.agentBackend.url

export async function bootstrapAgentSession() {
  const response = await fetch("/api/agent/session", {
    credentials: "include",
    cache: "no-store",
  })
  return (await response.json()) as SessionResponse
}

export function connectAgentSocket(sessionId: string) {
  const url = new URL(agentBackendUrl)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = "/ws"
  url.searchParams.set("sessionId", sessionId)
  return new WebSocket(url)
}

export function sendAgentEvent(
  socket: WebSocket,
  type: string,
  payload?: unknown
) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type, payload }))
  }
}
