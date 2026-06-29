import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import PlacesPanel from "@/components/workbench/PlacesPanel"
import { silkRoadRoute } from "@/lib/mock-routes"
import { useMapStore } from "@/stores/mapStore"

vi.mock("@/stores/mapStore", () => ({
  useMapStore: vi.fn(),
}))

function mockPlacesPanelStore(
  overrides: Partial<{
    currentRoute: typeof silkRoadRoute | null
    setCurrentRoute: ReturnType<typeof vi.fn>
    isDraftLocked: boolean
    sendAgentEvent: ReturnType<typeof vi.fn> | null
    setDraftSaveState: ReturnType<typeof vi.fn>
    setActiveWorkbenchTool: ReturnType<typeof vi.fn>
    startPointLocationSelection: ReturnType<typeof vi.fn>
    pointSelectionDraft: { lat: number; lng: number } | null
    setPointSelectionDraft: ReturnType<typeof vi.fn>
    setAddPointMode: ReturnType<typeof vi.fn>
  }> = {}
) {
  const state = {
    currentRoute: silkRoadRoute,
    setCurrentRoute: vi.fn(),
    isDraftLocked: false,
    sendAgentEvent: vi.fn(),
    setDraftSaveState: vi.fn(),
    setActiveWorkbenchTool: vi.fn(),
    startPointLocationSelection: vi.fn(),
    pointSelectionDraft: null,
    setPointSelectionDraft: vi.fn(),
    setAddPointMode: vi.fn(),
    ...overrides,
  }

  ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: typeof state) => unknown) => selector(state)
  )

  return state
}

describe("PlacesPanel", () => {
  it("starts map point selection", () => {
    const startPointLocationSelection = vi.fn()
    mockPlacesPanelStore({ startPointLocationSelection })

    render(<PlacesPanel />)
    fireEvent.click(screen.getByRole("button", { name: "地图选点" }))

    expect(startPointLocationSelection).toHaveBeenCalledTimes(1)
  })

  it("adds a selected draft point to the current route", () => {
    const setCurrentRoute = vi.fn()
    const setPointSelectionDraft = vi.fn()
    const setAddPointMode = vi.fn()
    const sendAgentEvent = vi.fn()
    mockPlacesPanelStore({
      setCurrentRoute,
      setPointSelectionDraft,
      setAddPointMode,
      sendAgentEvent,
      pointSelectionDraft: { lat: 39.9, lng: 116.4 },
    })

    render(<PlacesPanel />)
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
    expect(sendAgentEvent).toHaveBeenCalledWith("draft.replace", {
      route: {
        ...silkRoadRoute,
        points: [
          ...silkRoadRoute.points,
          expect.objectContaining({ name: "天安门" }),
        ],
      },
    })
    expect(setPointSelectionDraft).toHaveBeenCalledWith(null)
    expect(setAddPointMode).toHaveBeenCalledWith("closed")
  })
})
