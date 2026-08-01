import { periplusPublicConfig } from "@/config/periplus"
import type { TargetWorkspaceDocument } from "@/modules/data-model/contracts"

export interface AgentEvent {
  type: string
  payload?: unknown
}

interface WorkspaceBootstrapResponse {
  workspace: TargetWorkspaceDocument
  ticket: string
}

interface BootstrapErrorResponse {
  error?: { message?: string }
}

export const agentBackendUrl = periplusPublicConfig.agentBackend.url

let activeBootstrap:
  | { key: string; promise: Promise<WorkspaceBootstrapResponse> }
  | undefined

export function bootstrapWorkspace() {
  const currentUrl = new URL(window.location.href)
  const query = new URLSearchParams()
  const workspaceId = currentUrl.searchParams.get("workspace")
  const journeyId = currentUrl.searchParams.get("journey")
  if (workspaceId) query.set("workspace", workspaceId)
  else if (journeyId) query.set("journey", journeyId)
  const key = query.toString()
  if (activeBootstrap?.key === key) return activeBootstrap.promise

  const promise = fetch(`/api/agent/session${key ? `?${key}` : ""}`, {
    credentials: "include",
    cache: "no-store",
  }).then(async (response) => {
    const body = (await response.json()) as
      | WorkspaceBootstrapResponse
      | BootstrapErrorResponse
    if (!response.ok || !("workspace" in body) || !("ticket" in body)) {
      throw new Error(
        "error" in body
          ? (body.error?.message ?? "Workspace bootstrap failed")
          : "Workspace bootstrap failed"
      )
    }
    currentUrl.searchParams.delete("journey")
    currentUrl.searchParams.set("workspace", body.workspace.session.id)
    window.history.replaceState(null, "", currentUrl)
    return body
  })
  activeBootstrap = { key, promise }
  return promise
}

export function connectAgentSocket(ticket: string) {
  const url = new URL(agentBackendUrl)
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:"
  url.pathname = "/ws"
  url.searchParams.set("ticket", ticket)
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
