"use client"

import { useEffect, useReducer, useRef } from "react"
import { resolveTransitPlans } from "@/modules/data/journeys/client"
import {
  buildTransitPlanRequest,
  transitPlanFingerprint,
  type TransitPlanRequest,
  type TransitProviderErrorCode,
} from "@/lib/journeys/planning"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { TransitEvent } from "@/types/journey"

const DEBOUNCE_MS = 750
const MAX_TRANSITS_PER_REQUEST = 20
const CLIENT_RETRY_BASE_MS = 4_000
const MAX_CLIENT_RETRIES = 2
const TRANSIENT_FAILURE_CODES = new Set<TransitProviderErrorCode>([
  "RATE_LIMIT",
  "TIMEOUT",
])

export default function TransitPlanSync() {
  const draftJourney = useWorkspaceStore((state) => state.draftJourney)
  const markPlanning = useWorkspaceStore(
    (state) => state.markTransitPlansPlanning
  )
  const applyBundles = useWorkspaceStore(
    (state) => state.applyTransitPlanBundles
  )
  const markFailures = useWorkspaceStore(
    (state) => state.markTransitPlanFailures
  )
  const attempted = useRef(new Set<string>())
  const retryCounts = useRef(new Map<string, number>())
  const retryTimers = useRef(new Map<string, number>())
  const [retryRevision, requestRetry] = useReducer(
    (revision: number) => revision + 1,
    0
  )

  useEffect(() => {
    const timers = retryTimers.current
    return () => {
      for (const timer of timers.values()) window.clearTimeout(timer)
      timers.clear()
    }
  }, [])

  useEffect(() => {
    if (!draftJourney) return
    const pending: TransitPlanRequest[] = []

    for (const event of draftJourney.events) {
      if (event.type !== "TRANSIT") continue
      const request = buildTransitPlanRequest(event, draftJourney.events)
      if (!request) continue
      const fingerprint = transitPlanFingerprint(request)
      if (
        hasUsableProviderGeometry(event, fingerprint) &&
        event.detail.planningFingerprint === fingerprint &&
        event.detail.planningStatus === "READY"
      ) {
        continue
      }
      const attemptKey = `${event.id}:${fingerprint}`
      if (attempted.current.has(attemptKey)) continue
      pending.push(request)
      if (pending.length >= MAX_TRANSITS_PER_REQUEST) break
    }
    if (!pending.length) return

    const timer = window.setTimeout(() => {
      const requestByEventId = new Map(
        pending.map((request) => [request.transitEventId, request])
      )
      for (const request of pending) {
        attempted.current.add(
          `${request.transitEventId}:${transitPlanFingerprint(request)}`
        )
      }
      markPlanning(pending.map((request) => request.transitEventId))
      resolveTransitPlans(pending)
        .then(({ bundles, failures }) => {
          if (bundles.length) {
            applyBundles(bundles)
            for (const bundle of bundles) {
              const request = requestByEventId.get(bundle.transitEventId)
              if (!request) continue
              clearScheduledRetry(
                `${request.transitEventId}:${transitPlanFingerprint(request)}`,
                retryCounts.current,
                retryTimers.current
              )
            }
          }
          if (failures.length) {
            markFailures(failures)
            for (const failure of failures) {
              if (!TRANSIENT_FAILURE_CODES.has(failure.code)) continue
              const request = requestByEventId.get(failure.transitEventId)
              if (!request) continue
              const attemptKey = `${request.transitEventId}:${transitPlanFingerprint(request)}`
              const retryCount = retryCounts.current.get(attemptKey) ?? 0
              if (
                retryCount >= MAX_CLIENT_RETRIES ||
                retryTimers.current.has(attemptKey)
              ) {
                continue
              }
              retryCounts.current.set(attemptKey, retryCount + 1)
              const retryTimer = window.setTimeout(
                () => {
                  retryTimers.current.delete(attemptKey)
                  attempted.current.delete(attemptKey)
                  requestRetry()
                },
                CLIENT_RETRY_BASE_MS * 2 ** retryCount
              )
              retryTimers.current.set(attemptKey, retryTimer)
            }
          }
        })
        .catch((error) => {
          markFailures(
            pending.map((request) => ({
              transitEventId: request.transitEventId,
              code: "MALFORMED_RESPONSE" as const,
              message: error instanceof Error ? error.message : "路线规划失败",
            }))
          )
        })
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [draftJourney, retryRevision, markPlanning, applyBundles, markFailures])

  return null
}

function clearScheduledRetry(
  attemptKey: string,
  retryCounts: Map<string, number>,
  retryTimers: Map<string, number>
) {
  const timer = retryTimers.get(attemptKey)
  if (timer !== undefined) window.clearTimeout(timer)
  retryTimers.delete(attemptKey)
  retryCounts.delete(attemptKey)
}

function hasUsableProviderGeometry(event: TransitEvent, fingerprint: string) {
  return event.detail.plans?.some(
    (plan) =>
      plan.provider === "amap" &&
      plan.requestFingerprint === fingerprint &&
      plan.segments.some(
        (segment) =>
          segment.geometryKind !== "NONE" &&
          segment.positions.length >= 2 &&
          (segment.mode !== "DRIVE" || segment.positions.length > 2)
      )
  )
}
