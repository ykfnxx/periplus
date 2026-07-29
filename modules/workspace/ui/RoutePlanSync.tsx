"use client"

import { useEffect, useReducer, useRef } from "react"
import { resolveRoutePlans } from "@/modules/data/routes/client"
import {
  buildRoutePlanRequest,
  routePlanFingerprint,
  type RoutePlanRequest,
  type RouteProviderErrorCode,
} from "@/lib/routes/planning"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { PathEdge, PathNode } from "@/types/route"

const DEBOUNCE_MS = 750
const MAX_EDGES_PER_REQUEST = 20
const CLIENT_RETRY_BASE_MS = 4_000
const MAX_CLIENT_RETRIES = 2
const TRANSIENT_FAILURE_CODES = new Set<RouteProviderErrorCode>([
  "RATE_LIMIT",
  "TIMEOUT",
])

export default function RoutePlanSync() {
  const draftRoute = useWorkspaceStore((state) => state.draftRoute)
  const markPlanning = useWorkspaceStore(
    (state) => state.markRoutePlansPlanning
  )
  const applyBundles = useWorkspaceStore((state) => state.applyRoutePlanBundles)
  const markFailures = useWorkspaceStore((state) => state.markRoutePlanFailures)
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
    if (!draftRoute) return
    const pending: RoutePlanRequest[] = []

    const collect = (nodes: PathNode[], edges: PathEdge[]) => {
      const nodeById = new Map(nodes.map((node) => [node.id, node]))
      for (const edge of edges) {
        const from = nodeById.get(edge.fromNodeId)
        const to = nodeById.get(edge.toNodeId)
        if (!from || !to) continue
        const request = buildRoutePlanRequest(edge, from, to)
        if (!request) continue
        const fingerprint = routePlanFingerprint(request)
        if (
          hasUsableProviderGeometry(edge, fingerprint) &&
          edge.planningFingerprint === fingerprint &&
          edge.planningStatus === "READY"
        ) {
          continue
        }
        const attemptKey = `${edge.id}:${fingerprint}`
        if (attempted.current.has(attemptKey)) continue
        pending.push(request)
        if (pending.length >= MAX_EDGES_PER_REQUEST) return
      }
    }

    collect(draftRoute.nodes, draftRoute.edges)
    for (const subPlan of draftRoute.subPlans) {
      if (pending.length >= MAX_EDGES_PER_REQUEST) break
      collect(subPlan.nodes, subPlan.edges)
    }
    if (!pending.length) return

    const timer = window.setTimeout(() => {
      const requestByEdgeId = new Map(
        pending.map((request) => [request.edgeId, request])
      )
      for (const request of pending) {
        attempted.current.add(
          `${request.edgeId}:${routePlanFingerprint(request)}`
        )
      }
      markPlanning(pending.map((request) => request.edgeId))
      resolveRoutePlans(pending)
        .then(({ bundles, failures }) => {
          if (bundles.length) {
            applyBundles(bundles)
            for (const bundle of bundles) {
              const request = requestByEdgeId.get(bundle.edgeId)
              if (!request) continue
              clearScheduledRetry(
                `${request.edgeId}:${routePlanFingerprint(request)}`,
                retryCounts.current,
                retryTimers.current
              )
            }
          }
          if (failures.length) {
            markFailures(failures)
            for (const failure of failures) {
              if (!TRANSIENT_FAILURE_CODES.has(failure.code)) continue
              const request = requestByEdgeId.get(failure.edgeId)
              if (!request) continue
              const attemptKey = `${request.edgeId}:${routePlanFingerprint(request)}`
              const retryCount = retryCounts.current.get(attemptKey) ?? 0
              if (
                retryCount >= MAX_CLIENT_RETRIES ||
                retryTimers.current.has(attemptKey)
              ) {
                continue
              }
              retryCounts.current.set(attemptKey, retryCount + 1)
              const timer = window.setTimeout(
                () => {
                  retryTimers.current.delete(attemptKey)
                  attempted.current.delete(attemptKey)
                  requestRetry()
                },
                CLIENT_RETRY_BASE_MS * 2 ** retryCount
              )
              retryTimers.current.set(attemptKey, timer)
            }
          }
        })
        .catch((error) => {
          markFailures(
            pending.map((request) => ({
              edgeId: request.edgeId,
              code: "MALFORMED_RESPONSE" as const,
              message: error instanceof Error ? error.message : "路线规划失败",
            }))
          )
        })
    }, DEBOUNCE_MS)

    return () => window.clearTimeout(timer)
  }, [draftRoute, retryRevision, markPlanning, applyBundles, markFailures])

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

function hasUsableProviderGeometry(edge: PathEdge, fingerprint: string) {
  return edge.plans?.some(
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
