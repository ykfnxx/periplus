import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, waitFor } from "@testing-library/react"
import {
  bootstrapAgentSession,
  connectAgentSocket,
  sendAgentEvent,
} from "@/lib/agent/client"
import AgentSync from "@/modules/workbench/ui/AgentSync"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

vi.mock("@/lib/agent/client", () => ({
  bootstrapAgentSession: vi.fn(),
  connectAgentSocket: vi.fn(),
  sendAgentEvent: vi.fn(),
}))

class FakeWebSocket extends EventTarget {
  close = vi.fn()
}

describe("AgentSync", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  })

  it("publishes the sender only after the socket is open", async () => {
    const socket = new FakeWebSocket()
    vi.mocked(bootstrapAgentSession).mockResolvedValue({
      sessionId: "session-1",
      draft: {
        sessionId: "session-1",
        document: null,
        sourceJourneyId: null,
        baseRevision: null,
        dirty: false,
        isLocked: false,
        lockedByRunId: null,
        revision: 0,
        pendingSuggestions: [],
        updatedAt: "2026-07-29T00:00:00.000Z",
      },
      messages: [],
    })
    vi.mocked(connectAgentSocket).mockReturnValue(
      socket as unknown as WebSocket
    )

    const { unmount } = render(<AgentSync />)
    await waitFor(() => {
      expect(connectAgentSocket).toHaveBeenCalledWith("session-1")
    })
    expect(useWorkspaceStore.getState().sendAgentEvent).toBeNull()

    act(() => socket.dispatchEvent(new Event("open")))
    await waitFor(() => {
      expect(useWorkspaceStore.getState().sendAgentEvent).toBeTypeOf("function")
    })

    useWorkspaceStore.getState().sendAgentEvent?.("draft.replace", {
      route: "fixture",
    })
    expect(sendAgentEvent).toHaveBeenCalledWith(socket, "draft.replace", {
      route: "fixture",
    })

    unmount()
    expect(socket.close).toHaveBeenCalledOnce()
    expect(useWorkspaceStore.getState().sendAgentEvent).toBeNull()
  })

  it("withdraws the sender when the socket closes", async () => {
    const socket = new FakeWebSocket()
    vi.mocked(bootstrapAgentSession).mockResolvedValue({
      sessionId: "session-1",
      draft: {
        sessionId: "session-1",
        document: null,
        sourceJourneyId: null,
        baseRevision: null,
        dirty: false,
        isLocked: false,
        lockedByRunId: null,
        revision: 0,
        pendingSuggestions: [],
        updatedAt: "2026-07-29T00:00:00.000Z",
      },
      messages: [],
    })
    vi.mocked(connectAgentSocket).mockReturnValue(
      socket as unknown as WebSocket
    )

    render(<AgentSync />)
    await waitFor(() => {
      expect(connectAgentSocket).toHaveBeenCalledOnce()
    })
    act(() => socket.dispatchEvent(new Event("open")))
    expect(useWorkspaceStore.getState().sendAgentEvent).not.toBeNull()

    act(() => socket.dispatchEvent(new Event("close")))
    expect(useWorkspaceStore.getState().sendAgentEvent).toBeNull()
  })
})
