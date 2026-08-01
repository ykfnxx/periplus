"use client"

import { useEffect } from "react"
import {
  bootstrapWorkspace,
  connectAgentSocket,
  sendAgentEvent,
  type AgentEvent,
} from "@/lib/agent/client"
import type { TargetWorkspaceDocument } from "@/modules/data-model/contracts"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

function workspaceFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  return (
    "workspace" in record ? record.workspace : payload
  ) as TargetWorkspaceDocument | null
}

function commandNameFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null
  const result = (payload as Record<string, unknown>).result
  if (!result || typeof result !== "object") return null
  const commandName = (result as Record<string, unknown>).commandName
  return typeof commandName === "string" ? commandName : null
}

function asDelta(payload: unknown) {
  return payload as {
    text?: string
    message?: string
    stream?: string
    commandId?: string
  }
}

function conversationMessages(document: TargetWorkspaceDocument) {
  return document.messages
    .filter((message) => message.role !== "SYSTEM")
    .map((message) => ({
      id: message.id,
      role:
        message.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: message.content,
      runId: message.agentRunId ?? null,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    }))
}

export default function AgentSync() {
  const applyWorkspaceDocument = useWorkspaceStore(
    (state) => state.applyWorkspaceDocument
  )
  const setAgentSender = useWorkspaceStore((state) => state.setAgentSender)
  const setChatMessages = useWorkspaceStore((state) => state.setChatMessages)
  const appendAssistantMessage = useWorkspaceStore(
    (state) => state.appendAssistantMessage
  )
  const setWorkspaceCommitState = useWorkspaceStore(
    (state) => state.setWorkspaceCommitState
  )
  const setFailedTransitPlanCommandId = useWorkspaceStore(
    (state) => state.setFailedTransitPlanCommandId
  )

  useEffect(() => {
    let socket: WebSocket | null = null
    let disposed = false

    const applyDocument = (document: TargetWorkspaceDocument | null) => {
      if (!document) return
      applyWorkspaceDocument(document)
      setChatMessages(conversationMessages(document))
    }

    bootstrapWorkspace()
      .then(({ workspace, ticket }) => {
        if (disposed) return
        applyDocument(workspace)

        const activeSocket = connectAgentSocket(ticket)
        socket = activeSocket
        activeSocket.addEventListener("open", () => {
          if (disposed) return
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
            message.type === "workspace.ready" ||
            message.type === "workspace.updated" ||
            message.type === "workspace.locked" ||
            message.type === "workspace.unlocked"
          ) {
            applyDocument(workspaceFromPayload(message.payload))
            const commandName = commandNameFromPayload(message.payload)
            if (commandName) {
              setWorkspaceCommitState(
                commandName === "workspace.commit" ? "success" : "idle"
              )
            }
            return
          }

          if (message.type === "agent.run.started") {
            setWorkspaceCommitState("idle")
            return
          }

          if (message.type === "agent.message.delta") {
            const delta = asDelta(message.payload)
            if (delta.stream === "stdout") {
              appendAssistantMessage(delta.text ?? "")
            }
            return
          }

          if (message.type === "agent.run.cancelled") {
            appendAssistantMessage("\n已停止。\n")
            return
          }

          if (message.type === "agent.run.failed" || message.type === "error") {
            const error = asDelta(message.payload)
            if (error.commandId?.startsWith("browser-plan:")) {
              setFailedTransitPlanCommandId(error.commandId)
            }
            if (error.commandId?.startsWith("browser-commit:")) {
              setWorkspaceCommitState("error")
            }
            appendAssistantMessage(`\n${error.message ?? "Agent 运行失败"}\n`)
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
    applyWorkspaceDocument,
    setAgentSender,
    setChatMessages,
    setFailedTransitPlanCommandId,
    setWorkspaceCommitState,
  ])

  return null
}
