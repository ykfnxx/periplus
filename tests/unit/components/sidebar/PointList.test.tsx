import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import PointList from "@/components/sidebar/PointList"
import { useMapStore } from "@/stores/mapStore"

vi.mock("@/stores/mapStore", () => ({
  useMapStore: vi.fn(),
}))

describe("PointList", () => {
  const mockOnEdit = vi.fn()
  const mockOnDelete = vi.fn()
  const mockSetSelectedLocationPoint = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows empty message when no route is selected", () => {
    ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: unknown) => unknown) => {
        const state = {
          currentRoute: null,
          selectedLocationPoint: null,
          setSelectedLocationPoint: mockSetSelectedLocationPoint,
        }
        return selector(state)
      }
    )

    render(<PointList onEdit={mockOnEdit} onDelete={mockOnDelete} />)
    expect(screen.getByText("暂无地点，点击添加")).toBeInTheDocument()
  })

  it("shows empty message when route has no points", () => {
    ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: unknown) => unknown) => {
        const state = {
          currentRoute: { points: [] },
          selectedLocationPoint: null,
          setSelectedLocationPoint: mockSetSelectedLocationPoint,
        }
        return selector(state)
      }
    )

    render(<PointList onEdit={mockOnEdit} onDelete={mockOnDelete} />)
    expect(screen.getByText("暂无地点，点击添加")).toBeInTheDocument()
  })

  it("renders points in order", () => {
    const route = {
      points: [
        { id: "p2", name: "Point B", lat: 2, lng: 2, order: 1 },
        { id: "p1", name: "Point A", lat: 1, lng: 1, order: 0 },
      ],
    }

    ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: unknown) => unknown) => {
        const state = {
          currentRoute: route,
          selectedLocationPoint: null,
          setSelectedLocationPoint: mockSetSelectedLocationPoint,
        }
        return selector(state)
      }
    )

    render(<PointList onEdit={mockOnEdit} onDelete={mockOnDelete} />)
    const items = screen.getAllByText(/Point/)
    expect(items[0]).toHaveTextContent("1. Point A")
    expect(items[1]).toHaveTextContent("2. Point B")
  })

  it("calls onEdit when edit button clicked", () => {
    const point = { id: "p1", name: "Point A", lat: 1, lng: 1, order: 0 }
    const route = { points: [point] }

    ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: unknown) => unknown) => {
        const state = {
          currentRoute: route,
          selectedLocationPoint: null,
          setSelectedLocationPoint: mockSetSelectedLocationPoint,
        }
        return selector(state)
      }
    )

    render(<PointList onEdit={mockOnEdit} onDelete={mockOnDelete} />)
    fireEvent.click(screen.getByText("编辑"))
    expect(mockOnEdit).toHaveBeenCalledWith(point)
  })

  it("calls onDelete when delete button clicked", () => {
    const point = { id: "p1", name: "Point A", lat: 1, lng: 1, order: 0 }
    const route = { points: [point] }

    ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: unknown) => unknown) => {
        const state = {
          currentRoute: route,
          selectedLocationPoint: null,
          setSelectedLocationPoint: mockSetSelectedLocationPoint,
        }
        return selector(state)
      }
    )

    render(<PointList onEdit={mockOnEdit} onDelete={mockOnDelete} />)
    fireEvent.click(screen.getByText("删除"))
    expect(mockOnDelete).toHaveBeenCalledWith("p1")
  })

  it("shows stay hours and notes when present", () => {
    const point = {
      id: "p1",
      name: "Point A",
      lat: 1,
      lng: 1,
      order: 0,
      stayHours: 1.5,
      notes: "Some notes",
    }
    const route = { points: [point] }

    ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: unknown) => unknown) => {
        const state = {
          currentRoute: route,
          selectedLocationPoint: null,
          setSelectedLocationPoint: mockSetSelectedLocationPoint,
        }
        return selector(state)
      }
    )

    render(<PointList onEdit={mockOnEdit} onDelete={mockOnDelete} />)
    expect(screen.getByText("停留 1.5 小时")).toBeInTheDocument()
    expect(screen.getByText("Some notes")).toBeInTheDocument()
  })
})
