import { describe, expect, it, vi } from "vitest"
import { DraftSessionService } from "@/modules/workspace/server/draft-session-service"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"
import type { Route } from "@/types/route"

const context = { userId: "user-1", role: "user" as const }

function persistedRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: "route-saved",
    ownerId: "user-1",
    version: 1,
    visibility: "private",
    name: "杭州周末",
    nodes: [
      {
        id: "node-1",
        routeId: "route-saved",
        name: "西湖",
        lat: 30.246,
        lng: 120.146,
        order: 0,
        category: "PLACE",
      },
    ],
    edges: [],
    subPlans: [],
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T01:00:00.000Z",
    ...overrides,
  }
}

describe("WorkspaceCommandService", () => {
  it("creates a persisted route and marks the draft clean", async () => {
    const drafts = new DraftSessionService()
    drafts.replaceDraft("session-1", {
      name: "杭州周末",
      nodes: persistedRoute().nodes,
      edges: [],
    })
    const routes = {
      get: vi.fn(),
      create: vi.fn(async () => persistedRoute()),
      update: vi.fn(),
    }
    const commands = new WorkspaceCommandService(drafts, {
      routes,
      persistRoutePlanning: false,
    })

    const snapshot = await commands.saveDraft(context, "session-1")

    expect(routes.create).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ name: "杭州周末" })
    )
    expect(snapshot).toMatchObject({
      sourceRouteId: "route-saved",
      baseVersion: 1,
      dirty: false,
      document: { id: "route-saved", name: "杭州周末" },
    })
  })

  it("uses the loaded base version when updating a route", async () => {
    const drafts = new DraftSessionService()
    const routes = {
      get: vi.fn(async () => persistedRoute({ version: 3 })),
      create: vi.fn(),
      update: vi.fn(async () => persistedRoute({ version: 4 })),
    }
    const commands = new WorkspaceCommandService(drafts, {
      routes,
      persistRoutePlanning: false,
    })
    await commands.loadSavedRoute(context, "session-1", "route-saved")
    drafts.routeUpdateNode("session-1", {
      nodeId: "node-1",
      patch: { name: "西湖新线" },
    })

    const snapshot = await commands.saveDraft(context, "session-1")

    expect(routes.update).toHaveBeenCalledWith(
      context,
      "route-saved",
      expect.objectContaining({ name: "杭州周末" }),
      3
    )
    expect(snapshot.baseVersion).toBe(4)
    expect(snapshot.dirty).toBe(false)
  })
})
