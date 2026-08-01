import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import DebugPanel from "@/components/debug/DebugPanel"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

vi.mock("@/modules/workspace/state/workspace-store", () => ({
  useWorkspaceStore: vi.fn(),
}))

describe("DebugPanel", () => {
  const applyWorkspaceDocument = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    ;(
      useWorkspaceStore as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((selector: (state: unknown) => unknown) =>
      selector({ applyWorkspaceDocument })
    )
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

  it("draws a target Workspace document from valid JSON", () => {
    render(<DebugPanel />)
    fireEvent.click(screen.getByText("绘制轨迹"))

    expect(applyWorkspaceDocument).toHaveBeenCalledOnce()
    const document = applyWorkspaceDocument.mock.calls[0][0]
    const graph = document.session.headGraph
    expect(graph.title).toBe("调试路线")
    expect(graph.description).toBe("通过坐标调试工具创建")
    expect(graph.events).toHaveLength(3)
    expect(graph.events[0].title).toBe("北京")
    expect(graph.events[0].detail.plannedLat).toBe(39.9042)
    expect(graph.events[0].detail.plannedLng).toBe(116.4074)
    expect(graph.links).toHaveLength(2)
    expect(document.session.headWorkspaceRevision).toBe(0)
  })

  it.each([
    ["not json", /JSON 解析错误/],
    ['{"name": "test"}', /输入必须是非空 JSON 数组/],
    ["[]", /输入必须是非空 JSON 数组/],
    ['[{"lat": 39, "lng": 116}]', /缺少 name 字段/],
    ['[{"name": "A", "lat": 100, "lng": 116}]', /纬度无效/],
    ['[{"name": "A", "lat": 39, "lng": 200}]', /经度无效/],
  ])("rejects invalid coordinate JSON %s", (input, expected) => {
    render(<DebugPanel />)
    fireEvent.change(screen.getByRole("textbox"), { target: { value: input } })
    fireEvent.click(screen.getByText("绘制轨迹"))

    expect(applyWorkspaceDocument).not.toHaveBeenCalled()
    expect(screen.getByText(expected)).toBeInTheDocument()
  })

  it("clears the target Workspace document and visible errors", () => {
    render(<DebugPanel />)
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "bad json" },
    })
    fireEvent.click(screen.getByText("绘制轨迹"))
    expect(screen.getByText(/JSON 解析错误/)).toBeInTheDocument()

    fireEvent.click(screen.getByText("清空"))
    expect(applyWorkspaceDocument).toHaveBeenCalledWith(null)
    expect(screen.queryByText(/JSON 解析错误/)).not.toBeInTheDocument()
  })
})
