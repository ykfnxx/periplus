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
import { agentRunStageFromPayload } from "./agent-run-presentation"

const RECONNECT_DELAY_MS = 1_000

function workspaceFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  return (
    "workspace" in record ? record.workspace : payload
  ) as TargetWorkspaceDocument | null
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
      blocks: message.blocks,
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
  const setAgentRunStage = useWorkspaceStore((state) => state.setAgentRunStage)
  const setFailedTransitPlanCommandId = useWorkspaceStore(
    (state) => state.setFailedTransitPlanCommandId
  )
  const failTransitPlanSelection = useWorkspaceStore(
    (state) => state.failTransitPlanSelection
  )

  useEffect(() => {
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0
    let connectionGeneration = 0
    let disposed = false

    const applyDocument = (document: TargetWorkspaceDocument | null) => {
      if (!document) return false
      if (!applyWorkspaceDocument(document)) return false
      setChatMessages(conversationMessages(document))
      if (!document.agentRuns.some((run) => run.status === "RUNNING")) {
        setAgentRunStage(null)
      }
      return true
    }

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) return
      setAgentSender(null)
      const pendingSelection =
        useWorkspaceStore.getState().pendingTransitPlanSelection
      if (pendingSelection) {
        failTransitPlanSelection(
          pendingSelection.commandId,
          "连接已中断，请重试路线切换"
        )
      }
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
            const documentAccepted = applyDocument(
              workspaceFromPayload(message.payload)
            )
            if (!documentAccepted) return
            return
          }

          if (message.type === "agent.run.started") {
            setAgentRunStage("UNDERSTANDING")
            return
          }

          if (message.type === "agent.run.progress") {
            setAgentRunStage(agentRunStageFromPayload(message.payload))
            return
          }

          if (message.type === "agent.message.delta") {
            const delta = asDelta(message.payload)
            appendAssistantMessage(delta.text ?? "")
            return
          }

          if (message.type === "agent.run.cancelled") {
            setAgentRunStage(null)
            appendAssistantMessage("\n已停止规划，行程未发生变化。\n")
            return
          }

          if (message.type === "agent.run.completed") {
            setAgentRunStage(null)
            return
          }

          if (message.type === "agent.run.needs_input") {
            setAgentRunStage(null)
            return
          }

          if (message.type === "agent.run.failed" || message.type === "error") {
            const error = asDelta(message.payload)
            if (error.commandId?.startsWith("browser-select:")) {
              failTransitPlanSelection(
                error.commandId,
                error.message ?? "路线切换失败，请重试"
              )
              return
            }
            if (error.commandId?.startsWith("browser-plan:")) {
              setFailedTransitPlanCommandId(error.commandId)
              return
            }
            setAgentRunStage(null)
            appendAssistantMessage(
              `\n${error.message ?? "Agent 运行失败"}，行程未发生变化。\n`
            )
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
    failTransitPlanSelection,
    setAgentSender,
    setAgentRunStage,
    setChatMessages,
    setFailedTransitPlanCommandId,
  ])

  return null
}
