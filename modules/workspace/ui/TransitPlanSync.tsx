"use client"

import { useEffect, useRef } from "react"
import {
  buildTransitPlanRequest,
  transitPlanFingerprint,
} from "@/lib/journeys/planning"
import {
  selectWorkspaceGraph,
  selectWorkspaceLocked,
  selectWorkspaceRevision,
} from "@/modules/workspace/state/selectors"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

const DEBOUNCE_MS = 750
const MAX_COMMAND_RETRIES = 2

export default function TransitPlanSync() {
  const document = useWorkspaceStore((state) => state.workspaceDocument)
  const graph = useWorkspaceStore(selectWorkspaceGraph)
  const revision = useWorkspaceStore(selectWorkspaceRevision)
  const isLocked = useWorkspaceStore(selectWorkspaceLocked)
  const sendAgentEvent = useWorkspaceStore((state) => state.sendAgentEvent)
  const failedCommandId = useWorkspaceStore(
    (state) => state.failedTransitPlanCommandId
  )
  const setFailedCommandId = useWorkspaceStore(
    (state) => state.setFailedTransitPlanCommandId
  )
  const attempted = useRef(new Set<string>())
  const attemptsByCommandId = useRef(new Map<string, string>())
  const retryCounts = useRef(new Map<string, number>())

  useEffect(() => {
    if (failedCommandId) {
      const failedAttemptKey = attemptsByCommandId.current.get(failedCommandId)
      if (failedAttemptKey) {
        const retryCount = retryCounts.current.get(failedAttemptKey) ?? 0
        if (retryCount < MAX_COMMAND_RETRIES) {
          retryCounts.current.set(failedAttemptKey, retryCount + 1)
          attempted.current.delete(failedAttemptKey)
        }
        attemptsByCommandId.current.delete(failedCommandId)
      }
      setFailedCommandId(null)
    }
    if (!document || !graph || !sendAgentEvent || isLocked) return

    for (const event of graph.events) {
      if (event.type !== "TRANSIT") continue
      const request = buildTransitPlanRequest(event, graph.events)
      if (!request) continue
      const fingerprint = transitPlanFingerprint(request)
      const completed = graph.transitPlanningRuns.some(
        (run) =>
          run.transitEventId === event.id &&
          run.requestFingerprint === fingerprint &&
          (run.status === "READY" || run.status === "FAILED")
      )
      const attemptKey = `${event.id}:${fingerprint}`
      if (completed) {
        attempted.current.delete(attemptKey)
        retryCounts.current.delete(attemptKey)
        continue
      }
      if (attempted.current.has(attemptKey)) continue

      const delayMs =
        DEBOUNCE_MS * 2 ** (retryCounts.current.get(attemptKey) ?? 0)
      const timer = window.setTimeout(() => {
        const commandId = `browser-plan:${document.session.id}:${event.id}:${fingerprint}:${revision}`
        attempted.current.add(attemptKey)
        attemptsByCommandId.current.set(commandId, attemptKey)
        sendAgentEvent("workspace.command", {
          commandId,
          expectedRevision: revision,
          idempotencyKey: commandId,
          command: {
            name: "journey.plan_transit",
            payload: { eventId: event.id, forceRefresh: false },
          },
        })
      }, delayMs)
      return () => window.clearTimeout(timer)
    }
  }, [
    document,
    failedCommandId,
    graph,
    isLocked,
    revision,
    sendAgentEvent,
    setFailedCommandId,
  ])

  return null
}
