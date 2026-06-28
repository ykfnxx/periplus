import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
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

function mockPlanPanelStore(overrides: Partial<{
  currentRoute: Route
  setCurrentRoute: ReturnType<typeof vi.fn>
  editingPointId: string | null
  setEditingPointId: ReturnType<typeof vi.fn>
  startPointLocationSelection: ReturnType<typeof vi.fn>
  pointSelectionDraft: { lat: number; lng: number } | null
  setPointSelectionDraft: ReturnType<typeof vi.fn>
  setAddPointMode: ReturnType<typeof vi.fn>
  photoShares: []
  setSelectedPhotoShare: ReturnType<typeof vi.fn>
  addPhotoShare: ReturnType<typeof vi.fn>
  startPhotoLocationSelection: ReturnType<typeof vi.fn>
  clearLocationSelection: ReturnType<typeof vi.fn>
  isSelectingLocation: boolean
  locationSelectionMode: "none"
}> = {}) {
  const state = {
    currentRoute: silkRoadRoute,
    setCurrentRoute: vi.fn(),
    editingPointId: null,
    setEditingPointId: vi.fn(),
    startPointLocationSelection: vi.fn(),
    pointSelectionDraft: null,
    setPointSelectionDraft: vi.fn(),
    setAddPointMode: vi.fn(),
    photoShares: [],
    setSelectedPhotoShare: vi.fn(),
    addPhotoShare: vi.fn(),
    startPhotoLocationSelection: vi.fn(),
    clearLocationSelection: vi.fn(),
    isSelectingLocation: false,
    locationSelectionMode: "none",
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

    render(<PlanPanel searchQuery="" />)
    expect(screen.getByText("丝绸之路")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "地图选点" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "保存变更" })).toBeInTheDocument()
  })

  it("starts point location selection from the map button", () => {
    const startPointLocationSelection = vi.fn()
    mockPlanPanelStore({ startPointLocationSelection })

    render(<PlanPanel searchQuery="" />)
    fireEvent.click(screen.getByRole("button", { name: "地图选点" }))

    expect(startPointLocationSelection).toHaveBeenCalledTimes(1)
  })

  it("adds a selected draft point to the route", () => {
    const setCurrentRoute = vi.fn()
    const setPointSelectionDraft = vi.fn()
    const setAddPointMode = vi.fn()
    mockPlanPanelStore({
      setCurrentRoute,
      setPointSelectionDraft,
      setAddPointMode,
      pointSelectionDraft: { lat: 39.9, lng: 116.4 },
    })

    render(<PlanPanel searchQuery="" />)
    expect(screen.getByText("39.9000, 116.4000")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("地点名称"), {
      target: { value: "  天安门  " },
    })
    fireEvent.change(screen.getByLabelText("停留小时"), {
      target: { value: "1.5" },
    })
    fireEvent.change(screen.getByLabelText("地点备注"), {
      target: { value: "  看升旗  " },
    })
    fireEvent.click(screen.getByRole("button", { name: "添加到路线" }))

    expect(setCurrentRoute).toHaveBeenCalledWith({
      ...silkRoadRoute,
      points: [
        ...silkRoadRoute.points,
        expect.objectContaining({
          id: expect.stringMatching(/^temp-/),
          name: "天安门",
          lat: 39.9,
          lng: 116.4,
          order: silkRoadRoute.points.length,
          stayHours: 1.5,
          notes: "看升旗",
        }),
      ],
    })
    expect(setPointSelectionDraft).toHaveBeenCalledWith(null)
    expect(setAddPointMode).toHaveBeenCalledWith("closed")
  })

  it("cancels the selected draft point form", () => {
    const setPointSelectionDraft = vi.fn()
    const setAddPointMode = vi.fn()
    mockPlanPanelStore({
      setPointSelectionDraft,
      setAddPointMode,
      pointSelectionDraft: { lat: 39.9, lng: 116.4 },
    })

    render(<PlanPanel searchQuery="" />)
    fireEvent.click(screen.getByRole("button", { name: "取消" }))

    expect(setPointSelectionDraft).toHaveBeenCalledWith(null)
    expect(setAddPointMode).toHaveBeenCalledWith("closed")
  })

  it("resets draft point form defaults after cancel", () => {
    const state = mockPlanPanelStore({
      pointSelectionDraft: { lat: 39.9, lng: 116.4 },
    })
    const { rerender } = render(<PlanPanel searchQuery="" />)

    fireEvent.change(screen.getByLabelText("地点名称"), {
      target: { value: "天安门" },
    })
    fireEvent.change(screen.getByLabelText("停留小时"), {
      target: { value: "2" },
    })
    fireEvent.change(screen.getByLabelText("地点备注"), {
      target: { value: "看升旗" },
    })
    fireEvent.click(screen.getByRole("button", { name: "取消" }))

    state.pointSelectionDraft = { lat: 31.23, lng: 121.47 }
    rerender(<PlanPanel searchQuery="" />)

    expect(screen.getByLabelText("地点名称")).toHaveValue("新地点")
    expect(screen.getByLabelText("停留小时")).toHaveValue(1)
    expect(screen.getByLabelText("地点备注")).toHaveValue("")
  })

  it("resets draft point form defaults before restarting map selection", () => {
    const state = mockPlanPanelStore({
      pointSelectionDraft: { lat: 39.9, lng: 116.4 },
    })
    const { rerender } = render(<PlanPanel searchQuery="" />)

    fireEvent.change(screen.getByLabelText("地点名称"), {
      target: { value: "天安门" },
    })
    fireEvent.change(screen.getByLabelText("停留小时"), {
      target: { value: "2" },
    })
    fireEvent.change(screen.getByLabelText("地点备注"), {
      target: { value: "看升旗" },
    })
    fireEvent.click(screen.getByRole("button", { name: "地图选点" }))

    state.pointSelectionDraft = { lat: 31.23, lng: 121.47 }
    rerender(<PlanPanel searchQuery="" />)

    expect(screen.getByLabelText("地点名称")).toHaveValue("新地点")
    expect(screen.getByLabelText("停留小时")).toHaveValue(1)
    expect(screen.getByLabelText("地点备注")).toHaveValue("")
  })

  it("does not carry save status to another selected route", async () => {
    const currentRoute = {
      ...silkRoadRoute,
      id: "route-current",
    }
    const state = mockPlanPanelStore({ currentRoute })
    vi.mocked(updateRoute).mockResolvedValueOnce(currentRoute)
    const { rerender } = render(<PlanPanel searchQuery="" />)

    fireEvent.click(screen.getByRole("button", { name: "保存变更" }))
    expect(await screen.findByText("保存成功")).toBeInTheDocument()

    state.currentRoute = {
      ...silkRoadRoute,
      id: "route-next",
      name: "下一条路线",
    }
    rerender(<PlanPanel searchQuery="" />)

    expect(screen.getByText("下一条路线")).toBeInTheDocument()
    expect(screen.queryByText("保存成功")).not.toBeInTheDocument()
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
    const { rerender } = render(<PlanPanel searchQuery="" />)

    fireEvent.click(screen.getByRole("button", { name: "保存变更" }))
    await screen.findByText("保存成功")

    state.currentRoute = savedRoute
    rerender(<PlanPanel searchQuery="" />)

    expect(screen.getByText("保存成功")).toBeInTheDocument()
  })
})
