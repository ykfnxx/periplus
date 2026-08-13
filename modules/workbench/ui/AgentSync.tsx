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

function journeyCommitFromPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  if (
    !record.document ||
    typeof record.document !== "object" ||
    typeof record.summary !== "string" ||
    !Array.isArray(record.changedEventIds) ||
    !record.changedEventIds.every((eventId) => typeof eventId === "string")
  ) {
    return null
  }
  return {
    document: record.document as TargetWorkspaceDocument,
    summary: record.summary,
    changedEventIds: record.changedEventIds,
  }
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
  const applyJourneyCommit = useWorkspaceStore(
    (state) => state.applyJourneyCommit
  )
  const clearJourneyCommitPresentation = useWorkspaceStore(
    (state) => state.clearJourneyCommitPresentation
  )
  const setAgentSender = useWorkspaceStore((state) => state.setAgentSender)
  const setChatMessages = useWorkspaceStore((state) => state.setChatMessages)
  const appendAssistantMessage = useWorkspaceStore(
    (state) => state.appendAssistantMessage
  )
  const setAgentRunStage = useWorkspaceStore((state) => state.setAgentRunStage)
  useEffect(() => {
    let socket: WebSocket | null = null
    let reconnectTimer: number | null = null
    let reconnectAttempt = 0
    let connectionGeneration = 0
    let commitPresentationTimer: number | null = null
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

          if (message.type === "journey.committed") {
            const commit = journeyCommitFromPayload(message.payload)
            if (!commit) return
            if (
              !applyJourneyCommit(
                commit.document,
                commit.summary,
                commit.changedEventIds
              )
            ) {
              return
            }
            setChatMessages(conversationMessages(commit.document))
            setAgentRunStage(null)
            if (commitPresentationTimer !== null) {
              window.clearTimeout(commitPresentationTimer)
            }
            const revision = commit.document.session.flatJourney.revision
            commitPresentationTimer = window.setTimeout(() => {
              clearJourneyCommitPresentation(revision)
              commitPresentationTimer = null
            }, 5_000)
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
      if (commitPresentationTimer !== null) {
        window.clearTimeout(commitPresentationTimer)
      }
      setAgentSender(null)
      socket?.close()
    }
  }, [
    appendAssistantMessage,
    applyJourneyCommit,
    applyWorkspaceDocument,
    clearJourneyCommitPresentation,
    setAgentSender,
    setAgentRunStage,
    setChatMessages,
  ])

  return null
}
