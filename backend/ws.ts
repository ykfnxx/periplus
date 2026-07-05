import type { Server } from "node:http"
import { WebSocket, WebSocketServer } from "ws"
import { AgentRunner } from "./agent-runner"
import { DraftInputError, DraftStore } from "./draft-store"
import { getSessionId } from "./session"
import type { AgentEvent, AgentEventEmitter } from "./types"

interface WireMessage {
  type: string
  payload?: Record<string, unknown>
}

function send(socket: WebSocket, event: AgentEvent) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(event))
  }
}

function errorEvent(error: unknown): AgentEvent {
  if (error instanceof DraftInputError || error instanceof Error) {
    return { type: "error", payload: { message: error.message } }
  }
  return { type: "error", payload: { message: "Unexpected WebSocket error" } }
}

export function createAgentWebSocketServer(
  server: Server,
  store: DraftStore,
  agentRunner: AgentRunner
) {
  const wss = new WebSocketServer({ noServer: true })
  const socketsBySession = new Map<string, Set<WebSocket>>()

  const broadcast: AgentEventEmitter = (sessionId, event) => {
    const sockets = socketsBySession.get(sessionId)
    if (!sockets) return
    for (const socket of sockets) send(socket, event)
  }

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://periplus.local")
    if (url.pathname !== "/ws") return

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req)
    })
  })

  wss.on("connection", (socket, req) => {
    const sessionId = getSessionId(req)
    if (!sessionId) {
      send(socket, {
        type: "error",
        payload: { message: "Missing session id" },
      })
      socket.close()
      return
    }
    const context = store.getSessionContext(sessionId)
    if (!context) {
      send(socket, {
        type: "error",
        payload: { message: "Missing authenticated session context" },
      })
      socket.close()
      return
    }

    const sessionSockets =
      socketsBySession.get(sessionId) ?? new Set<WebSocket>()
    sessionSockets.add(socket)
    socketsBySession.set(sessionId, sessionSockets)
    send(socket, {
      type: "session.ready",
      payload: store.getSnapshot(sessionId),
    })

    socket.on("message", async (rawMessage) => {
      try {
        const message = JSON.parse(rawMessage.toString("utf8")) as WireMessage
        const payload = message.payload ?? {}

        if (message.type === "draft.get") {
          send(socket, {
            type: "draft.updated",
            payload: store.getSnapshot(sessionId),
          })
          return
        }
        if (message.type === "draft.load_saved_route") {
          const snapshot = await store.loadSavedRoute(
            context,
            sessionId,
            String(payload.routeId)
          )
          broadcast(sessionId, { type: "draft.updated", payload: snapshot })
          return
        }
        if (message.type === "draft.replace") {
          const snapshot = store.replaceDraft(sessionId, payload.route as never)
          broadcast(sessionId, { type: "draft.updated", payload: snapshot })
          return
        }
        if (message.type === "draft.reset") {
          const snapshot = store.replaceDraft(sessionId, null)
          broadcast(sessionId, { type: "draft.updated", payload: snapshot })
          return
        }
        if (message.type === "draft.save") {
          const snapshot = await store.saveDraft(context, sessionId)
          broadcast(sessionId, { type: "draft.updated", payload: snapshot })
          broadcast(sessionId, { type: "draft.saved", payload: snapshot })
          return
        }
        if (message.type === "agent.run.start") {
          await agentRunner.start(sessionId, String(payload.prompt), broadcast)
          return
        }
        if (message.type === "agent.run.cancel") {
          agentRunner.cancel(sessionId)
        }
      } catch (error) {
        send(socket, errorEvent(error))
      }
    })

    socket.on("close", () => {
      sessionSockets.delete(socket)
      if (sessionSockets.size === 0) socketsBySession.delete(sessionId)
    })
  })

  return broadcast
}
