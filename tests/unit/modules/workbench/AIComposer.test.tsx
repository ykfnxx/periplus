import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import AIComposer from "@/modules/workbench/ui/AIComposer"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

vi.mock("@/modules/workspace/state/workspace-store", () => ({
  useWorkspaceStore: vi.fn(),
}))

vi.mock("@/modules/workbench/ui/AgentModeToggle", () => ({
  default: () => <div data-testid="agent-mode-toggle">AgentModeToggle</div>,
}))

function mockStore(overrides: Record<string, unknown> = {}) {
  const base = {
    workspaceDocument: {
      accessState: "OWNER",
      draftState: "DIRTY",
      session: {
        id: "workspace-1",
        headWorkspaceRevision: 4,
        baseJourneyRevision: 2,
        status: "ACTIVE",
      },
      agentRuns: [],
    },
    composerInput: "",
    agentMode: "auto",
    setWorkbenchTab: vi.fn(),
    setComposerInput: vi.fn(),
    sendAgentEvent: vi.fn(),
    addUserMessage: vi.fn(),
    workspaceCommitState: "idle",
    setWorkspaceCommitState: vi.fn(),
    lightboxPhotoShare: null,
  }
  ;(
    useWorkspaceStore as unknown as ReturnType<typeof vi.fn>
  ).mockImplementation((selector: (s: unknown) => unknown) =>
    selector({ ...base, ...overrides })
  )
}

describe("AIComposer", () => {
  it("renders textarea, agent mode toggle, save and send buttons", () => {
    mockStore()
    render(<AIComposer />)

    expect(screen.getByLabelText("AI 输入")).toBeInTheDocument()
    expect(screen.getByTestId("agent-mode-toggle")).toBeInTheDocument()
    expect(screen.getByLabelText("保存")).toBeInTheDocument()
    expect(screen.getByLabelText("发送")).toBeInTheDocument()
  })

  it("does not show save button when the Workspace is locked", () => {
    mockStore({
      workspaceDocument: {
        session: {},
        agentRuns: [{ status: "RUNNING" }],
      },
    })
    render(<AIComposer />)

    expect(screen.queryByLabelText("保存")).not.toBeInTheDocument()
    expect(screen.getByLabelText("停止")).toBeInTheDocument()
  })

  it("sends prompt on submit", () => {
    const sendAgentEvent = vi.fn()
    const addUserMessage = vi.fn()
    const setWorkbenchTab = vi.fn()
    const setComposerInput = vi.fn()
    mockStore({
      composerInput: "hello",
      sendAgentEvent,
      addUserMessage,
      setWorkbenchTab,
      setComposerInput,
    })

    render(<AIComposer />)
    fireEvent.click(screen.getByLabelText("发送"))

    expect(addUserMessage).toHaveBeenCalledWith("hello")
    expect(setWorkbenchTab).toHaveBeenCalledWith("chat")
    expect(sendAgentEvent).toHaveBeenCalledWith("agent.run.start", {
      prompt: "hello",
      mode: "auto",
    })
    expect(setComposerInput).toHaveBeenCalledWith("")
  })

  it("commits through the authoritative Workspace command", () => {
    const sendAgentEvent = vi.fn()
    const setWorkspaceCommitState = vi.fn()
    mockStore({ sendAgentEvent, setWorkspaceCommitState })

    render(<AIComposer />)
    fireEvent.click(screen.getByLabelText("保存"))

    expect(setWorkspaceCommitState).toHaveBeenCalledWith("saving")
    expect(sendAgentEvent).toHaveBeenCalledWith("workspace.command", {
      commandId: "browser-commit:workspace-1:4",
      expectedRevision: 4,
      idempotencyKey: "browser-commit:workspace-1:4",
      command: {
        name: "workspace.commit",
        payload: { expectedJourneyRevision: 2 },
      },
    })
  })

  it("disables save button when no current journey", () => {
    mockStore({ workspaceDocument: null })
    render(<AIComposer />)

    expect(screen.getByLabelText("保存")).toBeDisabled()
  })

  it("disables save button when the Workspace is already clean", () => {
    mockStore({
      workspaceDocument: {
        accessState: "OWNER",
        draftState: "CLEAN",
        session: {
          id: "workspace-1",
          headWorkspaceRevision: 4,
          baseJourneyRevision: 2,
          status: "ACTIVE",
        },
        agentRuns: [],
      },
    })
    render(<AIComposer />)

    expect(screen.getByLabelText("保存")).toBeDisabled()
  })

  it("blocks stale save and exposes refresh, replay, and fork recovery", () => {
    const sendAgentEvent = vi.fn()
    mockStore({
      sendAgentEvent,
      workspaceDocument: {
        accessState: "OWNER",
        draftState: "STALE",
        session: {
          id: "workspace-1",
          headWorkspaceRevision: 4,
          baseJourneyRevision: 2,
          status: "ACTIVE",
        },
        agentRuns: [],
      },
    })
    render(<AIComposer />)

    expect(screen.getByLabelText("保存")).toBeDisabled()
    fireEvent.click(screen.getByLabelText("保存"))
    expect(sendAgentEvent).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "刷新并重放" }))
    expect(sendAgentEvent).toHaveBeenCalledWith("workspace.command", {
      commandId: "browser-recover:workspace.refresh:workspace-1:4",
      expectedRevision: 4,
      idempotencyKey: "browser-recover:workspace.refresh:workspace-1:4",
      command: {
        name: "workspace.refresh",
        payload: { fromWorkspaceRevision: 0 },
      },
    })
    expect(screen.getByRole("button", { name: "仅重放" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "派生副本" })).toBeEnabled()
  })

  it("makes every Agent mutation control read-only when access is expired", () => {
    mockStore({
      composerInput: "should not send",
      workspaceDocument: {
        accessState: "EXPIRED",
        draftState: "DIRTY",
        session: {
          id: "workspace-1",
          headWorkspaceRevision: 4,
          baseJourneyRevision: 2,
          status: "EXPIRED",
        },
        agentRuns: [],
      },
    })
    render(<AIComposer />)

    expect(screen.getByLabelText("AI 输入")).toBeDisabled()
    expect(screen.getByLabelText("保存")).toBeDisabled()
    expect(screen.getByLabelText("发送")).toBeDisabled()
    expect(screen.getByText(/只读状态/)).toBeVisible()
  })

  it("disables send button when input is empty", () => {
    mockStore({ composerInput: "   " })
    render(<AIComposer />)

    expect(screen.getByLabelText("发送")).toBeDisabled()
  })

  it("submits prompt on Enter key", () => {
    const sendAgentEvent = vi.fn()
    const addUserMessage = vi.fn()
    const setWorkbenchTab = vi.fn()
    const setComposerInput = vi.fn()
    mockStore({
      composerInput: "hello",
      sendAgentEvent,
      addUserMessage,
      setWorkbenchTab,
      setComposerInput,
    })

    render(<AIComposer />)
    fireEvent.keyDown(screen.getByLabelText("AI 输入"), {
      key: "Enter",
      code: "Enter",
      shiftKey: false,
    })

    expect(addUserMessage).toHaveBeenCalledWith("hello")
    expect(setWorkbenchTab).toHaveBeenCalledWith("chat")
    expect(sendAgentEvent).toHaveBeenCalledWith("agent.run.start", {
      prompt: "hello",
      mode: "auto",
    })
    expect(setComposerInput).toHaveBeenCalledWith("")
  })

  it("does not submit on Shift+Enter", () => {
    const sendAgentEvent = vi.fn()
    const addUserMessage = vi.fn()
    mockStore({
      composerInput: "hello",
      sendAgentEvent,
      addUserMessage,
    })

    render(<AIComposer />)
    fireEvent.keyDown(screen.getByLabelText("AI 输入"), {
      key: "Enter",
      code: "Enter",
      shiftKey: true,
    })

    expect(addUserMessage).not.toHaveBeenCalled()
    expect(sendAgentEvent).not.toHaveBeenCalled()
  })

  it("disables textarea when the Workspace is locked", () => {
    mockStore({
      workspaceDocument: {
        session: {},
        agentRuns: [{ status: "RUNNING" }],
      },
    })
    render(<AIComposer />)

    expect(screen.getByLabelText("AI 输入")).toBeDisabled()
  })

  it("shows success feedback when the commit succeeds", () => {
    mockStore({ workspaceCommitState: "success" })
    render(<AIComposer />)

    expect(screen.getByText("保存成功")).toBeInTheDocument()
  })

  it("shows error feedback when the commit fails", () => {
    mockStore({ workspaceCommitState: "error" })
    render(<AIComposer />)

    expect(screen.getByText("保存失败")).toBeInTheDocument()
  })

  it("does not trigger cancel on Escape when lightboxPhotoShare is set", () => {
    const sendAgentEvent = vi.fn()
    mockStore({
      workspaceDocument: {
        session: {},
        agentRuns: [{ status: "RUNNING" }],
      },
      lightboxPhotoShare: { id: "photo-1" },
      sendAgentEvent,
    })

    render(<AIComposer />)
    fireEvent.keyDown(window, { key: "Escape", code: "Escape" })

    expect(sendAgentEvent).not.toHaveBeenCalled()
  })
})
