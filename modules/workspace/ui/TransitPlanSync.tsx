"use client"

import { useEffect, useRef } from "react"
import {
  buildTransitPlanRequest,
  transitPlanFingerprint,
} from "@/lib/journeys/planning"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

const DEBOUNCE_MS = 750
export default function TransitPlanSync() {
  const draftJourney = useWorkspaceStore((state) => state.draftJourney)
  const draftRevision = useWorkspaceStore((state) => state.draftRevision)
  const isDraftLocked = useWorkspaceStore((state) => state.isDraftLocked)
  const sendAgentEvent = useWorkspaceStore((state) => state.sendAgentEvent)
  const attempted = useRef(new Map<string, number>())

  useEffect(() => {
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
      const timer = window.setTimeout(() => {
        attempted.current.set(attemptKey, draftRevision)
        sendAgentEvent("draft.command", {
          tool: "journey.plan_transit",
          input: {
            eventId: event.id,
            expectedRevision: draftRevision,
            idempotencyKey: `browser-plan:${draftJourney.id}:${event.id}:${fingerprint}:${draftRevision}`,
          },
        })
      }, DEBOUNCE_MS)
      return () => window.clearTimeout(timer)
    }
  }, [draftJourney, draftRevision, isDraftLocked, sendAgentEvent])

  return null
}
