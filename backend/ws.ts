import type { Server } from "node:http"
import { WebSocket, WebSocketServer } from "ws"
import { z } from "zod"
import { targetCommandEnvelopeSchema } from "@/modules/data-model/contracts"
import { WorkspaceInputError } from "@/modules/data/workspaces/workspace-repository"
import { verifyWorkspaceTicket } from "@/modules/data/workspaces/workspace-ticket"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"
import { AgentGateway } from "./agent/gateway"
import type { AgentEvent, AgentEventEmitter, AgentMode } from "./types"
import { domainErrorResponse } from "./domain-error"

const commandIdSchema = z.object({ commandId: z.string().optional() })
const wireMessageSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("workspace.get"),
      payload: commandIdSchema.strict().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("workspace.command"),
      payload: z.record(z.string(), z.unknown()),
    })
    .strict(),
  z
    .object({
      type: z.literal("agent.run.start"),
      payload: commandIdSchema
        .extend({
          prompt: z.string(),
          mode: z.enum(["auto", "suggest"]).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("agent.run.cancel"),
      payload: commandIdSchema.strict().optional(),
    })
    .strict(),
])

export function parseWireMessage(rawMessage: string) {
  let value: unknown
  try {
    value = JSON.parse(rawMessage)
  } catch {
    throw new WorkspaceInputError("WebSocket message must be valid JSON")
  }
  return wireMessageSchema.parse(value)
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
            const message = parseWireMessage(rawMessage.toString("utf8"))
            commandId =
              typeof message.payload?.commandId === "string"
                ? message.payload.commandId
                : undefined

            if (message.type === "workspace.get") {
              send(socket, {
                type: "workspace.updated",
                payload: await commands.getDocument(context, workspaceId),
              })
              return
            }
            if (message.type === "workspace.command") {
              const payload = message.payload
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
              const payload = message.payload
              const mode: AgentMode =
                payload.mode === "suggest" ? "suggest" : "auto"
              await agentGateway.start(
                context,
                workspaceId,
                payload.prompt,
                mode,
                broadcast
              )
              return
            }
            if (message.type === "agent.run.cancel") {
              agentGateway.cancel(workspaceId)
              return
            }
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
