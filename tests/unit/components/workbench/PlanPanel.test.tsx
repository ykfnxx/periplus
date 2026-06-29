import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import PlanPanel from "@/components/workbench/PlanPanel"
import { createRoute, updateRoute } from "@/lib/routes/client"
import { silkRoadRoute } from "@/lib/mock-routes"
import { useMapStore } from "@/stores/mapStore"
import type { Route } from "@/types/route"

vi.mock("@/lib/routes/client", () => ({
  createRoute: vi.fn(),
  updateRoute: vi.fn(),
}))

vi.mock("@/stores/mapStore", () => ({
  useMapStore: vi.fn(),
}))

function mockPlanPanelStore(
  overrides: Partial<{
    currentRoute: Route | null
    setCurrentRoute: ReturnType<typeof vi.fn>
    editingPointId: string | null
    setEditingPointId: ReturnType<typeof vi.fn>
    startPointLocationSelection: ReturnType<typeof vi.fn>
    setActiveWorkbenchTool: ReturnType<typeof vi.fn>
  }> = {}
) {
  const state = {
    currentRoute: silkRoadRoute,
    setCurrentRoute: vi.fn(),
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

  it("keeps save success after a new route receives its saved id", async () => {
    const savedRoute = {
      ...silkRoadRoute,
      id: "route-saved",
    }
    const state = mockPlanPanelStore()
    state.setCurrentRoute.mockImplementation((route: Route) => {
      state.currentRoute = route
    })
    vi.mocked(createRoute).mockResolvedValueOnce(savedRoute)
    const { rerender } = render(<PlanPanel />)

    fireEvent.click(screen.getByRole("button", { name: "保存变更" }))
    await waitFor(() => {
      expect(state.setCurrentRoute).toHaveBeenCalledWith(savedRoute)
    })

    state.currentRoute = savedRoute
    rerender(<PlanPanel />)

    expect(screen.getByText("保存成功")).toBeInTheDocument()
  })

  it("does not carry save status to another selected route", async () => {
    const currentRoute = {
      ...silkRoadRoute,
      id: "route-current",
    }
    const state = mockPlanPanelStore({ currentRoute })
    vi.mocked(updateRoute).mockResolvedValueOnce(currentRoute)
    const { rerender } = render(<PlanPanel />)

    fireEvent.click(screen.getByRole("button", { name: "保存变更" }))
    expect(await screen.findByText("保存成功")).toBeInTheDocument()

    state.currentRoute = {
      ...silkRoadRoute,
      id: "route-next",
      name: "下一条路线",
    }
    rerender(<PlanPanel />)

    expect(screen.getByText("下一条路线")).toBeInTheDocument()
    expect(screen.queryByText("保存成功")).not.toBeInTheDocument()
  })
})
