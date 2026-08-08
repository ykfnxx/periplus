import { beforeEach, describe, expect, it, vi } from "vitest"
import { AuthRequiredError } from "@/modules/auth/server/context"

vi.mock("@/modules/auth/server/context", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/modules/auth/server/context")>()
  return { ...original, requireCurrentUser: vi.fn() }
})
vi.mock("@/modules/data/workspaces/workspace-repository", () => ({
  listWorkspaceHistory: vi.fn(),
}))

import { GET } from "@/app/api/agent/workspaces/route"
import { requireCurrentUser } from "@/modules/auth/server/context"
import { listWorkspaceHistory } from "@/modules/data/workspaces/workspace-repository"

const context = { userId: "owner-1", role: "user" as const }

describe("GET /api/agent/workspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireCurrentUser).mockResolvedValue(context)
  })

  it("returns the current user's active conversation history", async () => {
    vi.mocked(listWorkspaceHistory).mockResolvedValue([
      {
        id: "workspace-1",
        sourceJourneyId: "journey-1",
        title: "规划丝绸之路",
        preview: "先从西安开始。",
        updatedAt: "2026-08-08T00:00:00.000Z",
      },
    ])

    const response = await GET()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      workspaces: [
        {
          id: "workspace-1",
          sourceJourneyId: "journey-1",
          title: "规划丝绸之路",
          preview: "先从西安开始。",
          updatedAt: "2026-08-08T00:00:00.000Z",
        },
      ],
    })
    expect(listWorkspaceHistory).toHaveBeenCalledWith(context)
  })

  it("requires authentication", async () => {
    vi.mocked(requireCurrentUser).mockRejectedValue(new AuthRequiredError())

    const response = await GET()

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      error: { code: "auth_required", message: "Authentication required" },
    })
  })
})
