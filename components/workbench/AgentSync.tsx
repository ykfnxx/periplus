"use client"

import { useEffect } from "react"
import {
  bootstrapAgentSession,
  connectAgentSocket,
  sendAgentEvent,
  type AgentEvent,
  type DraftSnapshot,
} from "@/lib/agent/client"
import { useMapStore } from "@/stores/mapStore"

function asDraftSnapshot(payload: unknown) {
  return payload as DraftSnapshot
}

function asDelta(payload: unknown) {
  return payload as { text?: string; message?: string }
}

export default function AgentSync() {
  const setCurrentRoute = useMapStore((state) => state.setCurrentRoute)
  const setDraftLocked = useMapStore((state) => state.setDraftLocked)
  const setAgentSender = useMapStore((state) => state.setAgentSender)
  const appendAgentMessage = useMapStore((state) => state.appendAgentMessage)
  const setDraftSaveState = useMapStore((state) => state.setDraftSaveState)

  useEffect(() => {
    let socket: WebSocket | null = null
    let disposed = false

    const applySnapshot = (snapshot: DraftSnapshot) => {
      setCurrentRoute(snapshot.route)
      setDraftLocked(snapshot.isLocked)
    }

    bootstrapAgentSession()
      .then(({ sessionId, draft }) => {
        if (disposed) return
        applySnapshot(draft)

        socket = connectAgentSocket(sessionId)
        setAgentSender((type, payload) => {
          if (socket) sendAgentEvent(socket, type, payload)
        })

        socket.addEventListener("message", (event) => {
          const message = JSON.parse(event.data) as AgentEvent

          if (
            message.type === "session.ready" ||
            message.type === "draft.updated" ||
            message.type === "draft.locked" ||
            message.type === "draft.unlocked"
          ) {
            applySnapshot(asDraftSnapshot(message.payload))
            return
          }

          if (message.type === "draft.saved") {
            setDraftSaveState("success")
            return
          }

          if (message.type === "agent.run.started") {
            setDraftSaveState("idle")
            return
          }

          if (message.type === "agent.message.delta") {
            appendAgentMessage(asDelta(message.payload).text ?? "")
            return
          }

          if (message.type === "agent.run.completed") {
            appendAgentMessage("\nAgent 已完成\n")
            return
          }

          if (message.type === "agent.run.cancelled") {
            appendAgentMessage("\nAgent 已停止\n")
            return
          }

          if (message.type === "agent.run.failed" || message.type === "error") {
            appendAgentMessage(`\n${asDelta(message.payload).message ?? "Agent 运行失败"}\n`)
            setDraftSaveState("error")
          }
        })
      })
      .catch(() => {
        setAgentSender(null)
      })

    return () => {
      disposed = true
      setAgentSender(null)
      socket?.close()
    }
  }, [
    appendAgentMessage,
    setAgentSender,
    setCurrentRoute,
    setDraftLocked,
    setDraftSaveState,
  ])

  return null
}
