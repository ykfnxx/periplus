import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import WorkbenchShell from "@/modules/workbench/ui/WorkbenchShell"
import { silkRoadRoute } from "@/lib/mock-routes"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

vi.mock("@/modules/workspace/state/workspace-store", () => ({
  useWorkspaceStore: vi.fn(),
}))

vi.mock("@/modules/workbench/ui/AgentSync", () => ({
  default: () => null,
}))

describe("WorkbenchShell", () => {
  it("shows preview tab by default", () => {
    ;(
      useWorkspaceStore as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((selector: (s: unknown) => unknown) =>
      selector({
        chatMessages: [],
        composerInput: "",
        setComposerInput: vi.fn(),
        addUserMessage: vi.fn(),
        sendAgentEvent: vi.fn(),
        isDraftLocked: false,
        draftRoute: silkRoadRoute,
        viewLevel: "overview",
        activeRouteNodeId: null,
        selectedEdgeId: null,
        setSelectedEdgeId: vi.fn(),
        setSelectedLocationPoint: vi.fn(),
        workbenchTab: "preview",
        setWorkbenchTab: vi.fn(),
        agentMode: "auto",
        setAgentMode: vi.fn(),
        draftSaveState: "idle",
        setDraftSaveState: vi.fn(),
        lightboxPhotoShare: null,
        map: null,
      })
    )

    render(<WorkbenchShell />)
    expect(screen.getByText("Preview")).toBeInTheDocument()
    expect(screen.getByText("顶层路线")).toBeInTheDocument()
    expect(screen.getByText(/西安/)).toBeInTheDocument()
  })

  it("shows centered initial state with preset prompts before chat starts", () => {
    const setComposerInput = vi.fn()
    const addUserMessage = vi.fn()
    const sendAgentEvent = vi.fn()
    const setWorkbenchTab = vi.fn()
    ;(
      useWorkspaceStore as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((selector: (s: unknown) => unknown) =>
      selector({
        chatMessages: [],
        composerInput: "保留这段输入",
        setComposerInput,
        addUserMessage,
        sendAgentEvent,
        isDraftLocked: false,
        draftRoute: null,
        workbenchTab: "chat",
        setWorkbenchTab,
        agentMode: "auto",
        setAgentMode: vi.fn(),
        draftSaveState: "idle",
        setDraftSaveState: vi.fn(),
        lightboxPhotoShare: null,
      })
    )

    render(<WorkbenchShell />)
    expect(screen.getByText("开始你的旅程")).toBeInTheDocument()
    expect(screen.getByText("规划一条丝绸之路路线")).toBeInTheDocument()
    expect(screen.getByLabelText("AI 初始输入")).toHaveValue("保留这段输入")

    fireEvent.click(screen.getByText("推荐北京周边徒步"))
    expect(addUserMessage).toHaveBeenCalledWith("推荐北京周边徒步")
    expect(setWorkbenchTab).toHaveBeenCalledWith("chat")
    expect(sendAgentEvent).toHaveBeenCalledWith("agent.run.start", {
      prompt: "推荐北京周边徒步",
      mode: "auto",
    })
  })
})
