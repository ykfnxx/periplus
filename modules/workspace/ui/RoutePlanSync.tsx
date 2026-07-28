"use client"

import { useEffect, useRef } from "react"
import { resolveRoutePlans } from "@/modules/data/routes/client"
import {
  buildRoutePlanRequest,
  routePlanFingerprint,
  type RoutePlanRequest,
} from "@/lib/routes/planning"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { PathEdge, PathNode } from "@/types/route"

const DEBOUNCE_MS = 750
const MAX_EDGES_PER_REQUEST = 20

export default function RoutePlanSync() {
  const draftRoute = useWorkspaceStore((state) => state.draftRoute)
  const markPlanning = useWorkspaceStore(
    (state) => state.markRoutePlansPlanning
  )
  const applyBundles = useWorkspaceStore((state) => state.applyRoutePlanBundles)
  const markFailures = useWorkspaceStore((state) => state.markRoutePlanFailures)
  const attempted = useRef(new Set<string>())

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
      for (const request of pending) {
        attempted.current.add(
          `${request.edgeId}:${routePlanFingerprint(request)}`
        )
      }
      markPlanning(pending.map((request) => request.edgeId))
      resolveRoutePlans(pending)
        .then(({ bundles, failures }) => {
          if (bundles.length) applyBundles(bundles)
          if (failures.length) markFailures(failures)
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
  }, [draftRoute, markPlanning, applyBundles, markFailures])

  return null
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
