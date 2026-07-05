import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import RoutePreview from "@/components/workbench/RoutePreview"
import { useMapStore } from "@/stores/mapStore"

const setSelectedEdgeId = vi.fn()
const setSelectedLocationPoint = vi.fn()
const setZoomAndCenter = vi.fn()

const mockMap = {
  setZoomAndCenter,
  add: vi.fn(),
  remove: vi.fn(),
  setFitView: vi.fn(),
}

// AMap is a global from the external SDK
;(globalThis as unknown as Record<string, unknown>).AMap = {
  LngLat: function (this: unknown, lng: number, lat: number) {
    return { lng, lat }
  },
  Polyline: function () {
    return { setPath: vi.fn() }
  },
}

vi.mock("@/stores/mapStore", () => ({
  useMapStore: vi.fn(),
}))

function mockStore(route: unknown | null) {
  ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (selector: (s: unknown) => unknown) =>
      selector({
        map: mockMap,
        currentRoute: route,
        viewLevel: "overview",
        activeRouteNodeId: null,
        setSelectedEdgeId,
        setSelectedLocationPoint,
      })
  )
}

const mockRoute = {
  id: "route-1",
  ownerId: "user-1",
  name: "丝绸之路",
  nodes: [
    {
      id: "node-xian",
      name: "西安",
      lat: 34.34,
      lng: 108.93,
      order: 0,
      category: "CITY",
      durationMinutes: 72 * 60,
      notes: "起点，兵马俑",
    },
    {
      id: "node-lanzhou",
      name: "兰州",
      lat: 36.06,
      lng: 103.83,
      order: 1,
      category: "CITY",
      durationMinutes: 48 * 60,
      notes: "黄河风情线",
    },
    {
      id: "node-zhangye",
      name: "张掖",
      lat: 38.92,
      lng: 100.44,
      order: 2,
      category: "CITY",
      durationMinutes: 48 * 60,
    },
  ],
  edges: [
    {
      id: "edge-1",
      fromNodeId: "node-xian",
      toNodeId: "node-lanzhou",
      status: "PLANNED",
      transportMode: "CAR",
      durationMinutes: 480,
      distanceKm: 640,
    },
    {
      id: "edge-2",
      fromNodeId: "node-lanzhou",
      toNodeId: "node-zhangye",
      status: "INCOMPLETE",
      transportMode: "FLIGHT",
      durationMinutes: 90,
      distanceKm: 500,
    },
  ],
  subPlans: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

describe("RoutePreview", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders empty state when no route is selected", () => {
    mockStore(null)
    render(<RoutePreview />)
    expect(screen.getByText("暂无路线预览")).toBeInTheDocument()
  })

  it("renders route title and level label", () => {
    mockStore(mockRoute)
    render(<RoutePreview />)
    expect(screen.getByText("丝绸之路")).toBeInTheDocument()
    expect(screen.getByText("顶层路线")).toBeInTheDocument()
  })

  it("renders all nodes in timeline", () => {
    mockStore(mockRoute)
    render(<RoutePreview />)
    expect(screen.getByText("西安")).toBeInTheDocument()
    expect(screen.getByText("兰州")).toBeInTheDocument()
    expect(screen.getByText("张掖")).toBeInTheDocument()
  })

  it("renders node durations and notes", () => {
    mockStore(mockRoute)
    render(<RoutePreview />)
    expect(screen.getByText("3 天")).toBeInTheDocument()
    expect(screen.getByText("起点，兵马俑")).toBeInTheDocument()
    expect(screen.getByText("黄河风情线")).toBeInTheDocument()
  })

  it("renders edge transport modes and details", () => {
    mockStore(mockRoute)
    render(<RoutePreview />)
    expect(screen.getByText("驾车")).toBeInTheDocument()
    expect(screen.getByText("飞机")).toBeInTheDocument()
    expect(screen.getByText("640 公里 · 8 小时")).toBeInTheDocument()
  })

  it("selects a node on click", () => {
    mockStore(mockRoute)
    render(<RoutePreview />)
    fireEvent.click(screen.getByText("西安"))
    expect(setSelectedEdgeId).toHaveBeenCalledWith(null)
    expect(setSelectedLocationPoint).toHaveBeenCalledWith(
      expect.objectContaining({ id: "node-xian" })
    )
  })

  it("selects an edge on click", () => {
    mockStore(mockRoute)
    render(<RoutePreview />)
    // Click on the edge transport label
    fireEvent.click(screen.getByText("驾车"))
    expect(setSelectedLocationPoint).toHaveBeenCalledWith(null)
    expect(setSelectedEdgeId).toHaveBeenCalledWith("edge-1")
  })
})
