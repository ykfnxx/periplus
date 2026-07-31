import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import DebugPanel from "@/components/debug/DebugPanel"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

vi.mock("@/modules/workspace/state/workspace-store", () => ({
  useWorkspaceStore: vi.fn(),
}))

describe("DebugPanel", () => {
  const mockSetDraftJourney = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(
      useWorkspaceStore as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((selector: (s: unknown) => unknown) => {
      const state = { setDraftJourney: mockSetDraftJourney }
      return selector(state)
    })
  })

  it("renders with example JSON data", () => {
    render(<DebugPanel />)
    expect(screen.getByText("输入 JSON 坐标数组：")).toBeInTheDocument()
    expect(screen.getByText("绘制轨迹")).toBeInTheDocument()
    expect(screen.getByText("清空")).toBeInTheDocument()

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    expect(textarea.value).toContain("北京")
    expect(textarea.value).toContain("西安")
    expect(textarea.value).toContain("成都")
  })

  it("draws route with valid JSON", () => {
    render(<DebugPanel />)
    fireEvent.click(screen.getByText("绘制轨迹"))

    expect(mockSetDraftJourney).toHaveBeenCalledOnce()
    const journey = mockSetDraftJourney.mock.calls[0][0]
    expect(journey.title).toBe("调试路线")
    expect(journey.description).toBe("通过坐标调试工具创建")
    expect(journey.events).toHaveLength(3)
    expect(journey.events[0].title).toBe("北京")
    expect(journey.events[0].detail.plannedLat).toBe(39.9042)
    expect(journey.events[0].detail.plannedLng).toBe(116.4074)
    expect(journey.links).toHaveLength(2)
  })

  it("shows error for invalid JSON", () => {
    render(<DebugPanel />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, { target: { value: "not json" } })
    fireEvent.click(screen.getByText("绘制轨迹"))

    expect(mockSetDraftJourney).not.toHaveBeenCalled()
    expect(screen.getByText(/JSON 解析错误/)).toBeInTheDocument()
  })

  it("shows error for non-array JSON", () => {
    render(<DebugPanel />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, { target: { value: '{"name": "test"}' } })
    fireEvent.click(screen.getByText("绘制轨迹"))

    expect(mockSetDraftJourney).not.toHaveBeenCalled()
    expect(screen.getByText("输入必须是非空 JSON 数组")).toBeInTheDocument()
  })

  it("shows error for empty array", () => {
    render(<DebugPanel />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, { target: { value: "[]" } })
    fireEvent.click(screen.getByText("绘制轨迹"))

    expect(mockSetDraftJourney).not.toHaveBeenCalled()
    expect(screen.getByText("输入必须是非空 JSON 数组")).toBeInTheDocument()
  })

  it("shows error for missing name field", () => {
    render(<DebugPanel />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, {
      target: { value: '[{"lat": 39, "lng": 116}]' },
    })
    fireEvent.click(screen.getByText("绘制轨迹"))

    expect(mockSetDraftJourney).not.toHaveBeenCalled()
    expect(screen.getByText(/缺少 name 字段/)).toBeInTheDocument()
  })

  it("shows error for invalid latitude", () => {
    render(<DebugPanel />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, {
      target: { value: '[{"name": "A", "lat": 100, "lng": 116}]' },
    })
    fireEvent.click(screen.getByText("绘制轨迹"))

    expect(mockSetDraftJourney).not.toHaveBeenCalled()
    expect(screen.getByText(/纬度无效/)).toBeInTheDocument()
  })

  it("shows error for invalid longitude", () => {
    render(<DebugPanel />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, {
      target: { value: '[{"name": "A", "lat": 39, "lng": 200}]' },
    })
    fireEvent.click(screen.getByText("绘制轨迹"))

    expect(mockSetDraftJourney).not.toHaveBeenCalled()
    expect(screen.getByText(/经度无效/)).toBeInTheDocument()
  })

  it("clears route when clear button clicked", () => {
    render(<DebugPanel />)
    fireEvent.click(screen.getByText("清空"))

    expect(mockSetDraftJourney).toHaveBeenCalledWith(null)
  })

  it("clears error when clear button clicked", () => {
    render(<DebugPanel />)
    const textarea = screen.getByRole("textbox")
    fireEvent.change(textarea, { target: { value: "bad json" } })
    fireEvent.click(screen.getByText("绘制轨迹"))
    expect(screen.getByText(/JSON 解析错误/)).toBeInTheDocument()

    fireEvent.click(screen.getByText("清空"))
    expect(screen.queryByText(/JSON 解析错误/)).not.toBeInTheDocument()
  })
})
