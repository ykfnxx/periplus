import { afterEach, describe, expect, it, vi } from "vitest"
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

const originalInnerWidth = window.innerWidth

afterEach(() => {
  setViewportWidth(originalInnerWidth)
  vi.clearAllMocks()
})

describe("WorkbenchShell", () => {
  it("shows the itinerary tab by default", () => {
    setViewportWidth(1_024)
    mockWorkspaceState({
      draftRoute: silkRoadRoute,
      workbenchTab: "preview",
    })

    render(<WorkbenchShell />)
    expect(
      screen.getByRole("tab", { name: "行程", selected: true })
    ).toBeInTheDocument()
    expect(screen.getByText("行程总览")).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "查看城市 西安" })
    ).toBeInTheDocument()
  })

  it("shows centered initial state with preset prompts before chat starts", () => {
    const setComposerInput = vi.fn()
    const addUserMessage = vi.fn()
    const sendAgentEvent = vi.fn()
    const setWorkbenchTab = vi.fn()
    setViewportWidth(1_024)
    mockWorkspaceState({
      composerInput: "保留这段输入",
      setComposerInput,
      addUserMessage,
      sendAgentEvent,
      draftRoute: null,
      workbenchTab: "chat",
      setWorkbenchTab,
    })

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

  it("renders chat and itinerary together on a wide viewport", () => {
    setViewportWidth(1_504)
    mockWorkspaceState({
      draftRoute: silkRoadRoute,
      workbenchTab: "preview",
    })

    render(<WorkbenchShell />)

    expect(
      screen.queryByRole("tablist", { name: "工作台面板" })
    ).not.toBeInTheDocument()
    expect(screen.getByText("AI 旅行助手")).toBeInTheDocument()
    expect(screen.getByText("行程总览")).toBeInTheDocument()
    expect(
      screen.getByText(
        "我已按当前范围整理好行程。选择城市或地点后，地图会同步显示对应路线。"
      )
    ).toBeInTheDocument()
  })

  it("uses a draggable three-position bottom sheet on mobile", () => {
    const setMobileSheetSnap = vi.fn()
    setViewportWidth(390)
    mockWorkspaceState({
      draftRoute: silkRoadRoute,
      workbenchTab: "preview",
      mobileSheetSnap: "half",
      setMobileSheetSnap,
    })

    render(<WorkbenchShell />)
    const handle = screen.getByRole("button", {
      name: "调整行程面板高度，当前为半屏",
    })

    expect(
      screen.getByRole("tablist", { name: "工作台面板" })
    ).toBeInTheDocument()
    fireEvent.click(handle)
    expect(setMobileSheetSnap).toHaveBeenCalledWith("expanded")

    Object.defineProperty(handle, "setPointerCapture", {
      configurable: true,
      value: vi.fn(),
    })
    fireEvent.pointerDown(handle, { pointerId: 1, clientY: 400 })
    fireEvent.pointerUp(handle, { pointerId: 1, clientY: 480 })
    expect(setMobileSheetSnap).toHaveBeenCalledWith("collapsed")
  })
})

function mockWorkspaceState(overrides: Record<string, unknown>) {
  const state = {
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
    selectedLocationPoint: null,
    photoShares: [],
    setSelectedEdgeId: vi.fn(),
    setSelectedLocationPoint: vi.fn(),
    setHoveredRouteNodeId: vi.fn(),
    selectRoutePlan: vi.fn(),
    requestMapFocus: vi.fn(),
    enterCityView: vi.fn(),
    returnToOverview: vi.fn(),
    workbenchTab: "preview",
    setWorkbenchTab: vi.fn(),
    mobileSheetSnap: "half",
    setMobileSheetSnap: vi.fn(),
    setMapViewportInsets: vi.fn(),
    agentMode: "auto",
    setAgentMode: vi.fn(),
    draftSaveState: "idle",
    setDraftSaveState: vi.fn(),
    lightboxPhotoShare: null,
    isSelectingLocation: false,
    locationSelectionMode: null,
    map: null,
    ...overrides,
  }

  ;(
    useWorkspaceStore as unknown as ReturnType<typeof vi.fn>
  ).mockImplementation((selector: (value: unknown) => unknown) =>
    selector(state)
  )
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  })
}
