"use client"

import { useEffect, useRef } from "react"
import {
  resolveRouteGeometries,
  type EdgeGeometryRequestPayload,
} from "@/modules/data/routes/client"
import {
  edgeGeometryKey,
  isRoadTransportMode,
  type LngLatTuple,
} from "@/lib/routes/edge-geometry"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { PathEdge, PathNode } from "@/types/route"

const MAX_EDGES_PER_REQUEST = 60

/**
 * 监听当前路线，把走路网的 edge（驾车/步行等）批量提交给
 * 服务端解析真实路径，结果按几何 key 合入 store。
 * 解析是渐进增强：请求期间 RoutePolyline 先画直线，结果到达后自动替换。
 */
export default function RouteGeometrySync() {
  const draftRoute = useWorkspaceStore((s) => s.draftRoute)
  const mergeEdgeGeometries = useWorkspaceStore((s) => s.mergeEdgeGeometries)
  // 本次会话内请求过的 key，不重复请求（含解析失败的，避免反复打配额）
  const attemptedKeys = useRef(new Set<string>())

  useEffect(() => {
    if (!draftRoute) return
    const { edgeGeometries } = useWorkspaceStore.getState()
    const pending = new Map<string, EdgeGeometryRequestPayload>()

    const collect = (nodes: PathNode[], edges: PathEdge[]) => {
      const nodeById = new Map(nodes.map((node) => [node.id, node]))
      for (const edge of edges) {
        if (!isRoadTransportMode(edge.transportMode)) continue
        const from = nodeById.get(edge.fromNodeId)
        const to = nodeById.get(edge.toNodeId)
        if (!from || !to) continue
        const key = edgeGeometryKey(from, to, edge.transportMode)
        if (edgeGeometries[key] || attemptedKeys.current.has(key)) continue
        pending.set(key, {
          from: { lat: from.lat, lng: from.lng },
          to: { lat: to.lat, lng: to.lng },
          transportMode: edge.transportMode,
        })
      }
    }

    collect(draftRoute.nodes, draftRoute.edges)
    for (const subPlan of draftRoute.subPlans ?? []) {
      collect(subPlan.nodes, subPlan.edges)
    }
    if (pending.size === 0) return

    const keys = [...pending.keys()].slice(0, MAX_EDGES_PER_REQUEST)
    for (const key of keys) attemptedKeys.current.add(key)

    resolveRouteGeometries(keys.map((key) => pending.get(key)!))
      .then((results) => {
        const entries: Record<string, LngLatTuple[]> = {}
        for (const result of results) {
          if (result.positions?.length >= 2) {
            entries[result.key] = result.positions
          }
        }
        if (Object.keys(entries).length) mergeEdgeGeometries(entries)
      })
      .catch(() => {
        // 网络/服务错误时允许下次路线变化再试
        for (const key of keys) attemptedKeys.current.delete(key)
      })
  }, [draftRoute, mergeEdgeGeometries])

  return null
}
