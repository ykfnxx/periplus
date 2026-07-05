import { beforeEach, describe, expect, it, vi } from "vitest"

const routeServiceMocks = vi.hoisted(() => ({
  createRoute: vi.fn(),
  getRoute: vi.fn(),
  updateRoute: vi.fn(),
}))

vi.mock("@/lib/routes/service", () => routeServiceMocks)

import { DraftStore } from "@/backend/draft-store"
import type { Route } from "@/types/route"

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

const userContext = { userId: "user-1", role: "user" as const }

describe("DraftStore", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("appends route nodes with explicit edges", () => {
    const store = new DraftStore()
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

    expect(snapshot.route!.nodes.map((node) => node.name)).toEqual([
      "西湖",
      "灵隐寺",
    ])
    expect(snapshot.route!.edges).toMatchObject([
      { fromNodeId: "node-1", toNodeId: "node-2", status: "INCOMPLETE" },
    ])
  })

  it("saves a new draft through route creation", async () => {
    const savedRoute: Route = {
      id: "route-saved",
      ownerId: "user-1",
      name: "杭州周末",
      nodes: [{ ...routeInput.nodes[0], routeId: "route-saved" }],
      edges: [],
      subPlans: [],
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T01:00:00.000Z",
    }
    routeServiceMocks.createRoute.mockResolvedValueOnce(savedRoute)
    const store = new DraftStore()
    store.replaceDraft("session-1", routeInput)

    const snapshot = await store.saveDraft(userContext, "session-1")

    expect(routeServiceMocks.createRoute).toHaveBeenCalledWith(
      userContext,
      expect.objectContaining({
        name: "杭州周末",
        nodes: expect.arrayContaining([
          expect.objectContaining({ id: "node-1", name: "西湖" }),
        ]),
        edges: [],
      })
    )
    expect(snapshot.sourceRouteId).toBe("route-saved")
    expect(snapshot.route!.id).toBe("route-saved")
  })

  it("stores conversation history for a session", () => {
    const store = new DraftStore()

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
    const store = new DraftStore()
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
    expect(snapshot.route?.nodes.map((node) => node.name)).toEqual([
      "西湖",
      "灵隐寺",
    ])
    expect(snapshot.route?.edges).toMatchObject([
      { fromNodeId: "node-1", toNodeId: "node-2" },
    ])
  })

  it("rejects a stored suggestion without changing the route", () => {
    const store = new DraftStore()
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
    expect(snapshot.route?.nodes[0].name).toBe("西湖")
  })
})
