import type { Server } from "node:http"
import { WebSocket, WebSocketServer } from "ws"
import { targetCommandEnvelopeSchema } from "@/modules/data-model/contracts"
import { verifyWorkspaceTicket } from "@/modules/data/workspaces/workspace-ticket"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"
import { AgentGateway } from "./agent/gateway"
import type { AgentEvent, AgentEventEmitter, AgentMode } from "./types"
import { domainErrorResponse } from "./domain-error"

interface WireMessage {
  type: string
  payload?: Record<string, unknown>
}

function send(socket: WebSocket, event: AgentEvent) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(event))
}

export function errorEvent(error: unknown, commandId?: string): AgentEvent {
  const response = domainErrorResponse(error)
  return {
    type: "error",
    payload: {
      code: response.code,
      message: response.message,
      commandId,
      ...(response.issues ? { issues: response.issues } : {}),
    },
  }
}

export function createAgentWebSocketServer(
  server: Server,
  commands: WorkspaceCommandService,
  agentGateway: AgentGateway
) {
  const wss = new WebSocketServer({ noServer: true })
  const socketsByWorkspace = new Map<string, Set<WebSocket>>()
  const broadcast: AgentEventEmitter = (workspaceId, event) => {
    for (const socket of socketsByWorkspace.get(workspaceId) ?? []) {
      send(socket, event)
    }
  }

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://periplus.local")
    if (url.pathname !== "/ws") return
    try {
      verifyWorkspaceTicket(url.searchParams.get("ticket") ?? "")
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req)
      })
    } catch {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
      socket.destroy()
    }
  })

  wss.on("connection", (socket, req) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://periplus.local")
      const claims = verifyWorkspaceTicket(url.searchParams.get("ticket") ?? "")
      const context = { userId: claims.subjectUserId, role: "user" as const }
      const workspaceId = claims.workspaceId
      const document = await commands.getDocument(context, workspaceId)
      if (!document) {
        send(socket, {
          type: "error",
          payload: { message: "Workspace was not found" },
        })
        socket.close()
        return
      }

      const workspaceSockets =
        socketsByWorkspace.get(workspaceId) ?? new Set<WebSocket>()
      workspaceSockets.add(socket)
      socketsByWorkspace.set(workspaceId, workspaceSockets)
      send(socket, { type: "workspace.ready", payload: document })

      socket.on("message", (rawMessage) => {
        void (async () => {
          let commandId: string | undefined
          try {
            const message = JSON.parse(
              rawMessage.toString("utf8")
            ) as WireMessage
            const payload = message.payload ?? {}
            commandId =
              typeof payload.commandId === "string"
                ? payload.commandId
                : undefined

            if (message.type === "workspace.get") {
              send(socket, {
                type: "workspace.updated",
                payload: await commands.getDocument(context, workspaceId),
              })
              return
            }
            if (message.type === "workspace.command") {
              const supplied =
                payload.envelope && typeof payload.envelope === "object"
                  ? (payload.envelope as Record<string, unknown>)
                  : payload
              const envelope = targetCommandEnvelopeSchema.parse({
                ...supplied,
                aggregateId: workspaceId,
                actor: { kind: "USER", userId: context.userId },
              })
              const result = await commands.execute(context, envelope)
              const current = await commands.getDocument(context, workspaceId)
              broadcast(workspaceId, {
                type: "workspace.updated",
                payload: { result, workspace: current },
              })
              return
            }
            if (message.type === "agent.run.start") {
              const mode: AgentMode =
                payload.mode === "suggest" ? "suggest" : "auto"
              await agentGateway.start(
                context,
                workspaceId,
                String(payload.prompt ?? ""),
                mode,
                broadcast
              )
              return
            }
            if (message.type === "agent.run.cancel") {
              agentGateway.cancel(workspaceId)
              return
            }
            throw new Error(`Unsupported WebSocket message ${message.type}`)
          } catch (error) {
            send(socket, errorEvent(error, commandId))
          }
        })()
      })

      socket.on("close", () => {
        workspaceSockets.delete(socket)
        if (workspaceSockets.size === 0) socketsByWorkspace.delete(workspaceId)
      })
    })().catch((error) => {
      send(socket, errorEvent(error))
      socket.close()
    })
  })

  return broadcast
}
