import type { Server } from "node:http"
import { WebSocket, WebSocketServer } from "ws"
import { z } from "zod"
import { OpenInferenceSpanKind } from "@arizeai/openinference-semantic-conventions"
import { targetCommandEnvelopeSchema } from "@/modules/data-model/contracts"
import { WorkspaceInputError } from "@/modules/data/workspaces/workspace-repository"
import { verifyWorkspaceTicket } from "@/modules/data/workspaces/workspace-ticket"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"
import { AgentGateway } from "./agent/gateway"
import type { AgentEvent, AgentEventEmitter } from "./types"
import { domainErrorResponse } from "./domain-error"
import { startTelemetrySpan } from "./observability"

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

export function commandIdFromRawWireMessage(rawMessage: string) {
  try {
    const value: unknown = JSON.parse(rawMessage)
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined
    }
    const payload = (value as Record<string, unknown>).payload
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return undefined
    }
    const commandId = (payload as Record<string, unknown>).commandId
    return typeof commandId === "string" ? commandId : undefined
  } catch {
    return undefined
  }
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
          const rawText = rawMessage.toString("utf8")
          const commandId = commandIdFromRawWireMessage(rawText)
          let messageSpan: ReturnType<typeof startTelemetrySpan> | undefined
          try {
            const message = parseWireMessage(rawText)
            messageSpan = startTelemetrySpan(
              "websocket.message",
              OpenInferenceSpanKind.CHAIN,
              { "periplus.websocket.message_type": message.type }
            )

            if (message.type === "workspace.get") {
              const document = await commands.getDocument(context, workspaceId)
              send(socket, { type: "workspace.updated", payload: document })
              messageSpan.end("OK")
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
              messageSpan.end("OK")
              return
            }
            if (message.type === "agent.run.start") {
              const payload = message.payload
              await agentGateway.start(
                context,
                workspaceId,
                payload.prompt,
                broadcast
              )
              messageSpan.end("OK")
              return
            }
            if (message.type === "agent.run.cancel") {
              agentGateway.cancel(workspaceId)
              messageSpan.end("OK")
              return
            }
          } catch (error) {
            messageSpan?.end("ERROR", {
              "error.type": error instanceof Error ? error.name : "Error",
            })
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
