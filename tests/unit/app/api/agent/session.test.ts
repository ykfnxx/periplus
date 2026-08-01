import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSilkRoadJourney } from "@/lib/mock-journeys"
import {
  AuthRequiredError,
  PermissionDeniedError,
} from "@/modules/auth/server/context"
import { workspaceDocumentForStory } from "@/tests/storybook/workspace-story"

vi.mock("@/modules/auth/server/context", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/modules/auth/server/context")>()
  return { ...original, requireCurrentUser: vi.fn() }
})
vi.mock("@/modules/data/journeys/journey-repository", () => ({
  getJourney: vi.fn(),
}))
vi.mock("@/modules/data/workspaces/workspace-repository", () => ({
  createWorkspace: vi.fn(),
  getWorkspaceDocument: vi.fn(),
}))
vi.mock("@/modules/data/workspaces/workspace-ticket", () => ({
  issueWorkspaceTicket: vi.fn(() => "ticket-1"),
}))

import { GET } from "@/app/api/agent/session/route"
import { requireCurrentUser } from "@/modules/auth/server/context"
import { getJourney } from "@/modules/data/journeys/journey-repository"
import {
  createWorkspace,
  getWorkspaceDocument,
} from "@/modules/data/workspaces/workspace-repository"
import { issueWorkspaceTicket } from "@/modules/data/workspaces/workspace-ticket"

const context = { userId: "owner-1", role: "user" as const }

function document() {
  const value = workspaceDocumentForStory(
    createSilkRoadJourney({ id: "journey-1", ownerId: context.userId })
  )
  value.session.id = "workspace-1"
  return value
}

describe("GET /api/agent/session", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(requireCurrentUser).mockResolvedValue(context)
  })

  it("resumes an owned Workspace and issues only a short-lived ticket", async () => {
    const workspace = document()
    vi.mocked(getWorkspaceDocument).mockResolvedValue(workspace)

    const response = await GET(
      new Request(
        "http://periplus.local/api/agent/session?workspace=workspace-1"
      )
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ workspace, ticket: "ticket-1" })
    expect(createWorkspace).not.toHaveBeenCalled()
    expect(issueWorkspaceTicket).toHaveBeenCalledWith(
      context.userId,
      "workspace-1"
    )
    expect(response.headers.get("set-cookie")).toBeNull()
  })

  it("creates a pinned Workspace from a saved Journey revision", async () => {
    const source = createSilkRoadJourney({
      id: "saved-journey",
      ownerId: context.userId,
    })
    const workspace = document()
    vi.mocked(getJourney).mockResolvedValue(source)
    vi.mocked(createWorkspace).mockResolvedValue(workspace.session)
    vi.mocked(getWorkspaceDocument).mockResolvedValue(workspace)

    const response = await GET(
      new Request(
        "http://periplus.local/api/agent/session?journey=saved-journey"
      )
    )

    expect(response.status).toBe(200)
    expect(createWorkspace).toHaveBeenCalledWith(context, {
      graph: source,
      sourceJourneyId: source.id,
      baseJourneyRevision: source.revision,
    })
  })

  it("creates a private target graph for the preset without legacy session state", async () => {
    const workspace = document()
    vi.mocked(createWorkspace).mockResolvedValue(workspace.session)
    vi.mocked(getWorkspaceDocument).mockResolvedValue(workspace)

    const response = await GET(
      new Request(
        "http://periplus.local/api/agent/session?journey=preset-silk-road"
      )
    )

    expect(response.status).toBe(200)
    const input = vi.mocked(createWorkspace).mock.calls[0]![1]
    expect(input.graph).toMatchObject({
      ownerId: context.userId,
      visibility: "PRIVATE",
      title: "丝绸之路",
    })
    expect(input.graph.id).not.toBe("preset-silk-road")
    expect(input).not.toHaveProperty("sourceJourneyId")
  })

  it("rejects ambiguous sources and unauthenticated callers", async () => {
    const ambiguous = await GET(
      new Request(
        "http://periplus.local/api/agent/session?workspace=w&journey=j"
      )
    )
    expect(ambiguous.status).toBe(400)

    vi.mocked(requireCurrentUser).mockRejectedValue(new AuthRequiredError())
    const unauthenticated = await GET(
      new Request("http://periplus.local/api/agent/session")
    )
    expect(unauthenticated.status).toBe(401)
  })

  it("maps cross-owner access to a stable 403", async () => {
    vi.mocked(getWorkspaceDocument).mockRejectedValue(
      new PermissionDeniedError()
    )

    const response = await GET(
      new Request(
        "http://periplus.local/api/agent/session?workspace=other-owner"
      )
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({
      error: { code: "permission_denied", message: "Permission denied" },
    })
    expect(issueWorkspaceTicket).not.toHaveBeenCalled()
  })

  it("returns 410 without a ticket for an expired Workspace", async () => {
    const workspace = document()
    workspace.accessState = "EXPIRED"
    workspace.session.status = "EXPIRED"
    vi.mocked(getWorkspaceDocument).mockResolvedValue(workspace)

    const response = await GET(
      new Request(
        "http://periplus.local/api/agent/session?workspace=workspace-1"
      )
    )

    expect(response.status).toBe(410)
    expect(await response.json()).toEqual({
      error: {
        code: "workspace_expired",
        message: "Workspace is no longer active",
      },
    })
    expect(issueWorkspaceTicket).not.toHaveBeenCalled()
  })
})
