import { act, render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  bootstrapWorkspace,
  connectAgentSocket,
  sendAgentEvent,
} from "@/lib/agent/client"
import { createSilkRoadJourney } from "@/lib/mock-journeys"
import AgentSync from "@/modules/workbench/ui/AgentSync"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { workspaceDocumentForStory } from "@/tests/storybook/workspace-story"

vi.mock("@/lib/agent/client", () => ({
  bootstrapWorkspace: vi.fn(),
  connectAgentSocket: vi.fn(),
  sendAgentEvent: vi.fn(),
  WorkspaceBootstrapError: class WorkspaceBootstrapError extends Error {
    constructor(
      message: string,
      public readonly status: number
    ) {
      super(message)
    }
  },
}))

class FakeWebSocket extends EventTarget {
  close = vi.fn()
}

function bootstrap() {
  const workspace = workspaceDocumentForStory(
    createSilkRoadJourney({ id: "journey-1", ownerId: "owner-1" })
  )
  workspace.session.id = "workspace-1"
  return { workspace, ticket: "ticket-1" }
}

describe("AgentSync", () => {
  beforeEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  })

  it("bootstraps a target Workspace and publishes the sender after open", async () => {
    const socket = new FakeWebSocket()
    const response = bootstrap()
    vi.mocked(bootstrapWorkspace).mockResolvedValue(response)
    vi.mocked(connectAgentSocket).mockReturnValue(
      socket as unknown as WebSocket
    )

    const { unmount } = render(<AgentSync />)
    await waitFor(() => {
      expect(connectAgentSocket).toHaveBeenCalledWith("ticket-1")
    })
    expect(useWorkspaceStore.getState().workspaceDocument).toEqual(
      response.workspace
    )
    expect(useWorkspaceStore.getState().sendAgentEvent).toBeNull()

    act(() => socket.dispatchEvent(new Event("open")))
    await waitFor(() => {
      expect(useWorkspaceStore.getState().sendAgentEvent).toBeTypeOf("function")
    })

    useWorkspaceStore.getState().sendAgentEvent?.("workspace.get")
    expect(sendAgentEvent).toHaveBeenCalledWith(
      socket,
      "workspace.get",
      undefined
    )

    unmount()
    expect(socket.close).toHaveBeenCalledOnce()
    expect(useWorkspaceStore.getState().sendAgentEvent).toBeNull()
  })

  it("withdraws the sender when the socket closes", async () => {
    const socket = new FakeWebSocket()
    vi.mocked(bootstrapWorkspace).mockResolvedValue(bootstrap())
    vi.mocked(connectAgentSocket).mockReturnValue(
      socket as unknown as WebSocket
    )

    render(<AgentSync />)
    await waitFor(() => expect(connectAgentSocket).toHaveBeenCalledOnce())
    act(() => socket.dispatchEvent(new Event("open")))
    expect(useWorkspaceStore.getState().sendAgentEvent).not.toBeNull()

    act(() => socket.dispatchEvent(new Event("close")))
    expect(useWorkspaceStore.getState().sendAgentEvent).toBeNull()
  })

  it("re-bootstraps with a fresh ticket after the socket closes", async () => {
    vi.useFakeTimers()
    const firstSocket = new FakeWebSocket()
    const secondSocket = new FakeWebSocket()
    const first = bootstrap()
    const second = bootstrap()
    second.ticket = "ticket-2"
    vi.mocked(bootstrapWorkspace)
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second)
    vi.mocked(connectAgentSocket)
      .mockReturnValueOnce(firstSocket as unknown as WebSocket)
      .mockReturnValueOnce(secondSocket as unknown as WebSocket)

    render(<AgentSync />)
    await act(async () => undefined)
    expect(connectAgentSocket).toHaveBeenCalledWith("ticket-1")

    act(() => firstSocket.dispatchEvent(new Event("close")))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })

    expect(bootstrapWorkspace).toHaveBeenCalledTimes(2)
    expect(connectAgentSocket).toHaveBeenLastCalledWith("ticket-2")
  })

  it("applies committed Journey documents atomically", async () => {
    const socket = new FakeWebSocket()
    const response = bootstrap()
    vi.mocked(bootstrapWorkspace).mockResolvedValue(response)
    vi.mocked(connectAgentSocket).mockReturnValue(
      socket as unknown as WebSocket
    )
    render(<AgentSync />)
    await waitFor(() => expect(connectAgentSocket).toHaveBeenCalledOnce())

    const updated = structuredClone(response.workspace)
    updated.session.headWorkspaceRevision = 2
    updated.session.flatJourney.revision = 2
    act(() =>
      socket.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "journey.committed",
            payload: {
              runId: "run-1",
              revision: 2,
              document: updated,
              summary: "增加了故宫，并按步行顺序调整路线。",
              changedEventIds: [updated.session.flatJourney.events[0]!.eventId],
            },
          }),
        })
      )
    )

    expect(
      useWorkspaceStore.getState().workspaceDocument?.session
        .headWorkspaceRevision
    ).toBe(2)
    expect(useWorkspaceStore.getState().journeyCommitPresentation).toEqual({
      revision: 2,
      summary: "增加了故宫，并按步行顺序调整路线。",
      changedEventIds: [updated.session.flatJourney.events[0]!.eventId],
    })
  })

  it("rejects document and command side effects from an older revision", async () => {
    const socket = new FakeWebSocket()
    const response = bootstrap()
    vi.mocked(bootstrapWorkspace).mockResolvedValue(response)
    vi.mocked(connectAgentSocket).mockReturnValue(
      socket as unknown as WebSocket
    )
    render(<AgentSync />)
    await waitFor(() => expect(connectAgentSocket).toHaveBeenCalledOnce())

    const revisionThree = structuredClone(response.workspace)
    revisionThree.session.headWorkspaceRevision = 3
    const revisionTwo = structuredClone(response.workspace)
    revisionTwo.session.headWorkspaceRevision = 2

    act(() => {
      socket.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "workspace.updated",
            payload: {
              result: { commandName: "journey.update_event" },
              workspace: revisionThree,
            },
          }),
        })
      )
      socket.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "workspace.updated",
            payload: {
              result: { commandName: "workspace.commit" },
              workspace: revisionTwo,
            },
          }),
        })
      )
    })

    expect(
      useWorkspaceStore.getState().workspaceDocument?.session
        .headWorkspaceRevision
    ).toBe(3)
  })
})
