"use client"

import { useEffect } from "react"
import {
  bootstrapAgentSession,
  connectAgentSocket,
  sendAgentEvent,
  type AgentConversationMessage,
  type AgentEvent,
  type DraftSnapshot,
} from "@/lib/agent/client"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

function asDraftSnapshot(payload: unknown) {
  return payload as DraftSnapshot
}

function asDelta(payload: unknown) {
  return payload as { text?: string; message?: string; stream?: string }
}

function asConversationMessages(
  messages: AgentConversationMessage[] | undefined
) {
  return messages ?? []
}

export default function AgentSync() {
  const applyDraftSnapshot = useWorkspaceStore(
    (state) => state.applyDraftSnapshot
  )
  const setDraftLocked = useWorkspaceStore((state) => state.setDraftLocked)
  const setAgentSender = useWorkspaceStore((state) => state.setAgentSender)
  const setChatMessages = useWorkspaceStore((state) => state.setChatMessages)
  const setPendingSuggestions = useWorkspaceStore(
    (state) => state.setPendingSuggestions
  )
  const appendAssistantMessage = useWorkspaceStore(
    (state) => state.appendAssistantMessage
  )
  const setDraftSaveState = useWorkspaceStore(
    (state) => state.setDraftSaveState
  )

  useEffect(() => {
    let socket: WebSocket | null = null
    let disposed = false

    const applySnapshot = (snapshot: DraftSnapshot) => {
      applyDraftSnapshot(snapshot.document, snapshot.revision)
      setDraftLocked(snapshot.isLocked)
      setPendingSuggestions(snapshot.pendingSuggestions ?? [])
    }

    bootstrapAgentSession()
      .then(({ sessionId, draft, messages }) => {
        if (disposed) return
        applySnapshot(draft)
        setChatMessages(asConversationMessages(messages))

        const activeSocket = connectAgentSocket(sessionId)
        socket = activeSocket
        activeSocket.addEventListener("open", () => {
          if (disposed) return
          // 只有 OPEN 后才发布发送器，依赖它的深链接加载事件不会在连接期丢失。
          setAgentSender((type, payload) => {
            sendAgentEvent(activeSocket, type, payload)
          })
        })
        activeSocket.addEventListener("close", () => {
          if (!disposed) setAgentSender(null)
        })
        activeSocket.addEventListener("error", () => {
          if (!disposed) setAgentSender(null)
        })

        activeSocket.addEventListener("message", (event) => {
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
            const delta = asDelta(message.payload)
            if (delta.stream === "stdout") {
              appendAssistantMessage(delta.text ?? "")
            }
            return
          }

          if (message.type === "agent.run.completed") {
            return
          }

          if (message.type === "agent.run.cancelled") {
            appendAssistantMessage("\n已停止。\n")
            return
          }

          if (message.type === "agent.run.failed" || message.type === "error") {
            appendAssistantMessage(
              `\n${asDelta(message.payload).message ?? "Agent 运行失败"}\n`
            )
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
    appendAssistantMessage,
    setAgentSender,
    setChatMessages,
    applyDraftSnapshot,
    setDraftLocked,
    setDraftSaveState,
    setPendingSuggestions,
  ])

  return null
}
