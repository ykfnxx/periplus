import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import AIComposer from "@/components/workbench/AIComposer"
import { useMapStore } from "@/stores/mapStore"

vi.mock("@/stores/mapStore", () => ({
  useMapStore: vi.fn(),
}))

vi.mock("@/components/workbench/AgentModeToggle", () => ({
  default: () => <div data-testid="agent-mode-toggle">AgentModeToggle</div>,
}))

function mockStore(overrides: Record<string, unknown> = {}) {
  const base = {
    currentRoute: { id: "route-1" },
    composerInput: "",
    agentMode: "auto",
    setWorkbenchTab: vi.fn(),
    setComposerInput: vi.fn(),
    sendAgentEvent: vi.fn(),
    addUserMessage: vi.fn(),
    isDraftLocked: false,
    draftSaveState: "idle",
    setDraftSaveState: vi.fn(),
    lightboxPhotoShare: null,
  }
  ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: unknown) => unknown) => selector({ ...base, ...overrides })
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

  it("does not show save button when draft is locked", () => {
    mockStore({ isDraftLocked: true })
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

  it("calls draft.save when save button is clicked", () => {
    const sendAgentEvent = vi.fn()
    const setDraftSaveState = vi.fn()
    mockStore({ sendAgentEvent, setDraftSaveState })

    render(<AIComposer />)
    fireEvent.click(screen.getByLabelText("保存"))

    expect(setDraftSaveState).toHaveBeenCalledWith("saving")
    expect(sendAgentEvent).toHaveBeenCalledWith("draft.save")
  })

  it("disables save button when no current route", () => {
    mockStore({ currentRoute: null })
    render(<AIComposer />)

    expect(screen.getByLabelText("保存")).toBeDisabled()
  })

  it("disables send button when input is empty", () => {
    mockStore({ composerInput: "   " })
    render(<AIComposer />)

    expect(screen.getByLabelText("发送")).toBeDisabled()
  })
})
