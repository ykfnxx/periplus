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

  it("applies workspace.updated envelopes and commit outcomes", async () => {
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
    act(() =>
      socket.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "workspace.updated",
            payload: {
              result: { commandName: "workspace.commit" },
              workspace: updated,
            },
          }),
        })
      )
    )

    expect(
      useWorkspaceStore.getState().workspaceDocument?.session
        .headWorkspaceRevision
    ).toBe(2)
    expect(useWorkspaceStore.getState().workspaceCommitState).toBe("success")

    const changed = structuredClone(updated)
    changed.session.headWorkspaceRevision = 3
    changed.draftState = "DIRTY"
    act(() =>
      socket.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "workspace.updated",
            payload: {
              result: { commandName: "journey.update_event" },
              workspace: changed,
            },
          }),
        })
      )
    )

    expect(useWorkspaceStore.getState().workspaceCommitState).toBe("idle")
  })

  it("never rolls the same Workspace document back to an older revision", async () => {
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
            payload: revisionThree,
          }),
        })
      )
      socket.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "workspace.updated",
            payload: revisionTwo,
          }),
        })
      )
    })

    expect(
      useWorkspaceStore.getState().workspaceDocument?.session
        .headWorkspaceRevision
    ).toBe(3)
  })

  it("correlates a browser planning error back to retry state", async () => {
    const socket = new FakeWebSocket()
    vi.mocked(bootstrapWorkspace).mockResolvedValue(bootstrap())
    vi.mocked(connectAgentSocket).mockReturnValue(
      socket as unknown as WebSocket
    )
    render(<AgentSync />)
    await waitFor(() => expect(connectAgentSocket).toHaveBeenCalledOnce())

    const commandId = "browser-plan:workspace:transit:fingerprint:7"
    act(() =>
      socket.dispatchEvent(
        new MessageEvent("message", {
          data: JSON.stringify({
            type: "error",
            payload: { message: "revision conflict", commandId },
          }),
        })
      )
    )

    expect(useWorkspaceStore.getState().failedTransitPlanCommandId).toBe(
      commandId
    )
    expect(useWorkspaceStore.getState().chatMessages).toHaveLength(0)
  })
})
