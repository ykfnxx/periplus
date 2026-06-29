import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import PlanPanel from "@/components/workbench/PlanPanel"
import { silkRoadRoute } from "@/lib/mock-routes"
import { useMapStore } from "@/stores/mapStore"
import type { Route } from "@/types/route"

vi.mock("@/stores/mapStore", () => ({
  useMapStore: vi.fn(),
}))

function mockPlanPanelStore(
  overrides: Partial<{
    currentRoute: Route | null
    setCurrentRoute: ReturnType<typeof vi.fn>
    isDraftLocked: boolean
    draftSaveState: "idle" | "saving" | "success" | "error"
    setDraftSaveState: ReturnType<typeof vi.fn>
    agentMessages: string[]
    sendAgentEvent: ReturnType<typeof vi.fn> | null
    editingPointId: string | null
    setEditingPointId: ReturnType<typeof vi.fn>
    startPointLocationSelection: ReturnType<typeof vi.fn>
    setActiveWorkbenchTool: ReturnType<typeof vi.fn>
  }> = {}
) {
  const state = {
    currentRoute: silkRoadRoute,
    setCurrentRoute: vi.fn(),
    isDraftLocked: false,
    draftSaveState: "idle" as const,
    setDraftSaveState: vi.fn(),
    agentMessages: [],
    sendAgentEvent: vi.fn(),
    editingPointId: null,
    setEditingPointId: vi.fn(),
    startPointLocationSelection: vi.fn(),
    setActiveWorkbenchTool: vi.fn(),
    ...overrides,
  }

  ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: typeof state) => unknown) => selector(state)
  )

  return state
}

describe("PlanPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders current route actions", () => {
    mockPlanPanelStore()

    render(<PlanPanel />)
    expect(screen.getByText("丝绸之路")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "添加地点" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "保存变更" })).toBeInTheDocument()
  })

  it("starts map point selection from the add place button", () => {
    const startPointLocationSelection = vi.fn()
    const setActiveWorkbenchTool = vi.fn()
    mockPlanPanelStore({ startPointLocationSelection, setActiveWorkbenchTool })

    render(<PlanPanel />)
    fireEvent.click(screen.getByRole("button", { name: "添加地点" }))

    expect(startPointLocationSelection).toHaveBeenCalledTimes(1)
    expect(setActiveWorkbenchTool).toHaveBeenCalledWith("places")
  })

  it("saves the current draft through the agent backend", () => {
    const sendAgentEvent = vi.fn()
    const setDraftSaveState = vi.fn()
    const setEditingPointId = vi.fn()
    mockPlanPanelStore({ sendAgentEvent, setDraftSaveState, setEditingPointId })

    render(<PlanPanel />)
    fireEvent.click(screen.getByRole("button", { name: "保存变更" }))

    expect(setDraftSaveState).toHaveBeenCalledWith("saving")
    expect(sendAgentEvent).toHaveBeenCalledWith("draft.save")
    expect(setEditingPointId).toHaveBeenCalledWith(null)
  })

  it("renders backend save success state", () => {
    mockPlanPanelStore({ draftSaveState: "success" })

    render(<PlanPanel />)
    expect(screen.getByText("保存成功")).toBeInTheDocument()
  })
})
