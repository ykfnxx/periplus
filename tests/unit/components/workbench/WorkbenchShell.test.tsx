import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import WorkbenchShell from "@/components/workbench/WorkbenchShell"
import { useMapStore } from "@/stores/mapStore"

vi.mock("@/stores/mapStore", () => ({
  useMapStore: vi.fn(),
}))

vi.mock("@/components/workbench/PlanPanel", () => ({
  default: () => <div>规划内容</div>,
}))

vi.mock("@/components/workbench/PlacesPanel", () => ({
  default: () => <div>地点内容</div>,
}))

vi.mock("@/components/workbench/PhotosPanel", () => ({
  default: () => <div>照片内容</div>,
}))

vi.mock("@/components/workbench/SavedPanel", () => ({
  default: () => <div>收藏内容</div>,
}))

describe("WorkbenchShell", () => {
  it("switches tools through the bottom rail without replacing the composer", () => {
    const setActiveWorkbenchTool = vi.fn()
    const setComposerInput = vi.fn()
    ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: unknown) => unknown) =>
        selector({
          activeWorkbenchTool: "plan",
          setActiveWorkbenchTool,
          composerInput: "保留这段输入",
          setComposerInput,
        })
    )

    render(<WorkbenchShell />)
    expect(screen.getByText("规划内容")).toBeInTheDocument()
    expect(screen.getByLabelText("AI 输入")).toHaveValue("保留这段输入")

    fireEvent.click(screen.getByRole("tab", { name: "地点" }))
    expect(setActiveWorkbenchTool).toHaveBeenCalledWith("places")
    expect(screen.getByLabelText("AI 输入")).toHaveValue("保留这段输入")
  })
})
