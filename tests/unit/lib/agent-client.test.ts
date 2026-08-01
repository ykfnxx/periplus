import { beforeEach, describe, expect, it, vi } from "vitest"
import { bootstrapWorkspace } from "@/lib/agent/client"
import { createSilkRoadJourney } from "@/lib/mock-journeys"
import { workspaceDocumentForStory } from "@/tests/storybook/workspace-story"

function bootstrapResponse(ticket: string) {
  const workspace = workspaceDocumentForStory(
    createSilkRoadJourney({ id: "journey-1", ownerId: "owner-1" })
  )
  workspace.session.id = "workspace-1"
  return new Response(JSON.stringify({ workspace, ticket }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

describe("Workspace bootstrap ticket lifecycle", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.history.replaceState(null, "", "/workspace?workspace=workspace-1")
  })

  it("deduplicates only the same in-flight request", async () => {
    let resolveFetch!: (response: Response) => void
    const fetchMock = vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })
    )

    const first = bootstrapWorkspace()
    const duplicate = bootstrapWorkspace()
    expect(fetchMock).toHaveBeenCalledOnce()

    resolveFetch(bootstrapResponse("ticket-1"))
    await expect(Promise.all([first, duplicate])).resolves.toHaveLength(2)
  })

  it("fetches a new ticket after a successful bootstrap settles", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(bootstrapResponse("ticket-1"))
      .mockResolvedValueOnce(bootstrapResponse("ticket-2"))

    await expect(bootstrapWorkspace()).resolves.toMatchObject({
      ticket: "ticket-1",
    })
    await expect(bootstrapWorkspace()).resolves.toMatchObject({
      ticket: "ticket-2",
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("retries after a transient bootstrap failure settles", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce(bootstrapResponse("ticket-after-retry"))

    await expect(bootstrapWorkspace()).rejects.toThrow(
      "temporary network failure"
    )
    await expect(bootstrapWorkspace()).resolves.toMatchObject({
      ticket: "ticket-after-retry",
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
