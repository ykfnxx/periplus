"use client"

import { useEffect, useRef } from "react"
import {
  buildTransitPlanRequest,
  transitPlanFingerprint,
} from "@/lib/journeys/planning"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

const DEBOUNCE_MS = 750
const MAX_COMMAND_RETRIES = 2
export default function TransitPlanSync() {
  const draftJourney = useWorkspaceStore((state) => state.draftJourney)
  const draftRevision = useWorkspaceStore((state) => state.draftRevision)
  const isDraftLocked = useWorkspaceStore((state) => state.isDraftLocked)
  const sendAgentEvent = useWorkspaceStore((state) => state.sendAgentEvent)
  const failedCommandId = useWorkspaceStore(
    (state) => state.failedTransitPlanCommandId
  )
  const setFailedCommandId = useWorkspaceStore(
    (state) => state.setFailedTransitPlanCommandId
  )
  const attempted = useRef(new Map<string, number>())
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
    if (!draftJourney || !sendAgentEvent || isDraftLocked) return

    for (const event of draftJourney.events) {
      if (event.type !== "TRANSIT") continue
      const request = buildTransitPlanRequest(event, draftJourney.events)
      if (!request) continue
      const fingerprint = transitPlanFingerprint(request)
      if (
        event.detail.planningFingerprint === fingerprint &&
        (event.detail.planningStatus === "READY" ||
          event.detail.planningStatus === "FAILED")
      ) {
        const completedAttemptKey = `${event.id}:${fingerprint}`
        attempted.current.delete(completedAttemptKey)
        retryCounts.current.delete(completedAttemptKey)
        for (const [commandId, attemptKey] of attemptsByCommandId.current) {
          if (attemptKey === completedAttemptKey) {
            attemptsByCommandId.current.delete(commandId)
          }
        }
        continue
      }
      const attemptKey = `${event.id}:${fingerprint}`
      const attemptedAtRevision = attempted.current.get(attemptKey)
      if (
        attemptedAtRevision !== undefined &&
        attemptedAtRevision !== draftRevision &&
        event.detail.planningFingerprint !== fingerprint
      ) {
        attempted.current.delete(attemptKey)
      }
      if (attempted.current.has(attemptKey)) continue
      const delayMs =
        DEBOUNCE_MS * 2 ** (retryCounts.current.get(attemptKey) ?? 0)
      const timer = window.setTimeout(() => {
        const commandId = `browser-plan:${draftJourney.id}:${event.id}:${fingerprint}:${draftRevision}`
        attempted.current.set(attemptKey, draftRevision)
        attemptsByCommandId.current.set(commandId, attemptKey)
        sendAgentEvent("draft.command", {
          commandId,
          tool: "journey.plan_transit",
          input: {
            eventId: event.id,
            expectedRevision: draftRevision,
            idempotencyKey: commandId,
          },
        })
      }, delayMs)
      return () => window.clearTimeout(timer)
    }
  }, [
    draftJourney,
    draftRevision,
    failedCommandId,
    isDraftLocked,
    sendAgentEvent,
    setFailedCommandId,
  ])

  return null
}
