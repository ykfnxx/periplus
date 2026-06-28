import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import WorkbenchShell from "@/components/workbench/WorkbenchShell"
import { useMapStore } from "@/stores/mapStore"

vi.mock("@/stores/mapStore", () => ({
  useMapStore: vi.fn(),
}))

vi.mock("@/components/workbench/ExplorePanel", () => ({
  default: () => <div>探索内容</div>,
}))

vi.mock("@/components/workbench/PlanPanel", () => ({
  default: () => <div>计划内容</div>,
}))

vi.mock("@/components/workbench/SavedPanel", () => ({
  default: () => <div>收藏内容</div>,
}))

describe("WorkbenchShell", () => {
  it("switches tabs through the store", () => {
    const setActiveWorkbenchTab = vi.fn()
    ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: unknown) => unknown) =>
        selector({
          activeWorkbenchTab: "explore",
          setActiveWorkbenchTab,
        })
    )

    render(<WorkbenchShell />)
    fireEvent.click(screen.getByRole("tab", { name: "计划" }))
    expect(setActiveWorkbenchTab).toHaveBeenCalledWith("plan")
  })
})
