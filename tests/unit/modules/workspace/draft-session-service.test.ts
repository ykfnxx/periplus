import { beforeEach, describe, expect, it, vi } from "vitest"

import { DraftSessionService } from "@/modules/workspace/server/draft-session-service"
import type { RoutePlan } from "@/types/route"

const routeInput = {
  name: "杭州周末",
  nodes: [
    {
      id: "node-1",
      name: "西湖",
      lat: 30.246,
      lng: 120.146,
      order: 0,
      category: "PLACE" as const,
    },
  ],
  edges: [],
}

describe("DraftSessionService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("appends route nodes with explicit edges", () => {
    const store = new DraftSessionService()
    store.replaceDraft("session-1", routeInput)

    const snapshot = store.routeAppendNode("session-1", {
      node: {
        id: "node-2",
        name: "灵隐寺",
        lat: 30.24,
        lng: 120.102,
        category: "PLACE",
      },
      edge: { id: "edge-1", status: "INCOMPLETE" },
    })

    expect(snapshot.document!.nodes.map((node) => node.name)).toEqual([
      "西湖",
      "灵隐寺",
    ])
    expect(snapshot.document!.edges).toMatchObject([
      { fromNodeId: "node-1", toNodeId: "node-2", status: "INCOMPLETE" },
    ])
  })

  it("links a resolved place to an existing route node", () => {
    const store = new DraftSessionService()
    store.replaceDraft("session-1", routeInput)

    const snapshot = store.routeLinkPlaceToNode("session-1", {
      nodeId: "node-1",
      place: {
        placeId: "place-west-lake",
        name: "西湖风景名胜区",
        category: "PARK",
        providerPlaceId: "B023B0",
        coordinate: {
          lat: 30.247,
          lng: 120.146,
          coordinateSystem: "GCJ02",
          provider: "amap",
        },
      },
    })

    expect(snapshot.document!.nodes[0]).toMatchObject({
      name: "西湖风景名胜区",
      lat: 30.247,
      lng: 120.146,
      placeId: "place-west-lake",
      coordinateSystem: "GCJ02",
      coordinateProvider: "amap",
      providerPlaceId: "B023B0",
      category: "SIGHT",
    })
  })

  it("plans a draft edge and switches route alternatives", async () => {
    const plans: RoutePlan[] = [
      {
        id: "plan-fast",
        provider: "mock",
        rank: 0,
        label: "最快",
        strategy: "fastest",
        distanceMeters: 10000,
        durationSeconds: 1200,
        trafficBasis: "TYPICAL",
        calculatedAt: "2026-07-11T00:00:00.000Z",
        requestFingerprint: "fingerprint",
        segments: [],
      },
      {
        id: "plan-cheap",
        provider: "mock",
        rank: 1,
        label: "少收费",
        strategy: "low_cost",
        distanceMeters: 12000,
        durationSeconds: 1800,
        fareAmount: 5,
        trafficBasis: "TYPICAL",
        calculatedAt: "2026-07-11T00:00:00.000Z",
        requestFingerprint: "fingerprint",
        segments: [],
      },
    ]
    const routePlanning = {
      plan: vi.fn(async (request) => ({
        edgeId: request.edgeId,
        requestFingerprint: request.requestFingerprint ?? "fingerprint",
        plans: plans.map((plan) => ({
          ...plan,
          requestFingerprint: request.requestFingerprint ?? "fingerprint",
        })),
      })),
    }
    const store = new DraftSessionService(routePlanning as never)
    store.replaceDraft("session-1", {
      name: "杭州周末",
      nodes: [
        routeInput.nodes[0],
        {
          id: "node-2",
          name: "灵隐寺",
          lat: 30.24,
          lng: 120.102,
          order: 1,
          category: "PLACE",
        },
      ],
      edges: [
        {
          id: "edge-1",
          fromNodeId: "node-1",
          toNodeId: "node-2",
          status: "PLANNED",
          transportMode: "CAR",
        },
      ],
    })

    const planned = await store.routePlanEdge("session-1", {
      edgeId: "edge-1",
    })
    const fingerprint = planned.document!.edges[0].planningFingerprint!
    expect(planned.document!.edges[0]).toMatchObject({
      planningStatus: "READY",
      selectedPlanId: "plan-fast",
      durationMinutes: 20,
    })

    const switched = store.routeSelectPlan("session-1", {
      edgeId: "edge-1",
      planId: "plan-cheap",
    })
    expect(switched.document!.edges[0]).toMatchObject({
      selectedPlanId: "plan-cheap",
      durationMinutes: 30,
      distanceKm: 12,
      costEstimate: 5,
      planningFingerprint: fingerprint,
    })
  })

  it("stores conversation history for a session", () => {
    const store = new DraftSessionService()

    store.addUserConversationMessage("session-1", "规划新疆路线")
    store.appendAssistantConversationDelta("session-1", "run-1", "可以。")
    store.appendAssistantConversationDelta(
      "session-1",
      "run-1",
      "先去乌鲁木齐。"
    )
    store.addUserConversationMessage("session-1", "把喀纳斯提前")

    const messages = store.getConversationMessages("session-1")

    expect(messages).toMatchObject([
      { role: "user", content: "规划新疆路线", runId: null },
      { role: "assistant", content: "可以。先去乌鲁木齐。", runId: "run-1" },
      { role: "user", content: "把喀纳斯提前", runId: null },
    ])

    messages[0].content = "外部修改不应写回 store"
    expect(store.getConversationMessages("session-1")[0].content).toBe(
      "规划新疆路线"
    )
  })

  it("accepts a stored suggestion through backend-owned tool calls", async () => {
    const store = new DraftSessionService()
    store.replaceDraft("session-1", routeInput)
    const suggested = store.createSuggestion("session-1", {
      title: "追加灵隐寺",
      summary: "在路线末尾追加灵隐寺节点",
      toolCalls: [
        {
          tool: "route.append_node",
          input: {
            node: {
              id: "node-2",
              name: "灵隐寺",
              lat: 30.24,
              lng: 120.102,
              category: "PLACE",
            },
            edge: { id: "edge-1", status: "INCOMPLETE" },
          },
        },
      ],
    })

    const snapshot = await store.acceptSuggestion(
      "session-1",
      suggested.pendingSuggestions[0].id
    )

    expect(snapshot.pendingSuggestions).toEqual([])
    expect(snapshot.document?.nodes.map((node) => node.name)).toEqual([
      "西湖",
      "灵隐寺",
    ])
    expect(snapshot.document?.edges).toMatchObject([
      { fromNodeId: "node-1", toNodeId: "node-2" },
    ])
  })

  it("rejects a stored suggestion without changing the route", () => {
    const store = new DraftSessionService()
    store.replaceDraft("session-1", routeInput)
    const suggested = store.createSuggestion("session-1", {
      title: "更新名称",
      summary: "修改第一个节点名称",
      toolCalls: [
        {
          tool: "route.update_node",
          input: {
            nodeId: "node-1",
            patch: { name: "新西湖" },
          },
        },
      ],
    })

    const snapshot = store.rejectSuggestion(
      "session-1",
      suggested.pendingSuggestions[0].id
    )

    expect(snapshot.pendingSuggestions).toEqual([])
    expect(snapshot.document?.nodes[0].name).toBe("西湖")
  })
})
