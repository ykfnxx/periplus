"use client"

import { useEffect } from "react"
import {
  bootstrapWorkspace,
  connectAgentSocket,
  sendAgentEvent,
  WorkspaceBootstrapError,
  type AgentEvent,
} from "@/lib/agent/client"
import type { TargetWorkspaceDocument } from "@/modules/data-model/contracts"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

const RECONNECT_DELAY_MS = 1_000

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

function outcomeFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null
  const result = (payload as Record<string, unknown>).result
  if (!result || typeof result !== "object") return null
  const outcome = (result as Record<string, unknown>).outcome
  return outcome && typeof outcome === "object"
    ? (outcome as Record<string, unknown>)
    : null
}

function retryableBootstrapError(error: unknown) {
  return !(
    error instanceof WorkspaceBootstrapError &&
    [401, 403, 410].includes(error.status)
  )
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
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0
    let connectionGeneration = 0
    let disposed = false

    const applyDocument = (document: TargetWorkspaceDocument | null) => {
      if (!document) return
      if (!applyWorkspaceDocument(document)) return
      setChatMessages(conversationMessages(document))
    }

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) return
      setAgentSender(null)
      const delay = Math.min(RECONNECT_DELAY_MS * 2 ** reconnectAttempt, 10_000)
      reconnectAttempt += 1
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null
        void connect()
      }, delay)
    }

    const connect = async () => {
      const generation = ++connectionGeneration
      try {
        const { workspace, ticket } = await bootstrapWorkspace()
        if (disposed || generation !== connectionGeneration) return
        applyDocument(workspace)

        const activeSocket = connectAgentSocket(ticket)
        socket = activeSocket
        activeSocket.addEventListener("open", () => {
          if (disposed || socket !== activeSocket) return
          reconnectAttempt = 0
          setAgentSender((type, payload) => {
            sendAgentEvent(activeSocket, type, payload)
          })
        })
        activeSocket.addEventListener("close", () => {
          if (disposed || socket !== activeSocket) return
          socket = null
          scheduleReconnect()
        })
        activeSocket.addEventListener("error", () => {
          if (disposed || socket !== activeSocket) return
          socket = null
          activeSocket.close()
          scheduleReconnect()
        })

        activeSocket.addEventListener("message", (event) => {
          if (disposed || socket !== activeSocket) return
          const message = JSON.parse(event.data) as AgentEvent

          if (
            message.type === "workspace.ready" ||
            message.type === "workspace.updated" ||
            message.type === "workspace.locked" ||
            message.type === "workspace.unlocked"
          ) {
            applyDocument(workspaceFromPayload(message.payload))
            const commandName = commandNameFromPayload(message.payload)
            const outcome = outcomeFromPayload(message.payload)
            if (commandName) {
              setWorkspaceCommitState(
                commandName === "workspace.commit" ? "success" : "idle"
              )
            }
            if (
              commandName === "workspace.fork" &&
              typeof outcome?.workspaceId === "string"
            ) {
              window.location.assign(
                `/workspace?workspace=${encodeURIComponent(outcome.workspaceId)}`
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
              return
            }
            if (error.commandId?.startsWith("browser-commit:")) {
              setWorkspaceCommitState("error")
            }
            appendAssistantMessage(`\n${error.message ?? "Agent 运行失败"}\n`)
          }
        })
      } catch (error) {
        setAgentSender(null)
        if (retryableBootstrapError(error)) scheduleReconnect()
      }
    }

    void connect()

    return () => {
      disposed = true
      connectionGeneration += 1
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer)
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
