import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import PlanPanel from "@/components/workbench/PlanPanel"
import { silkRoadRoute } from "@/lib/mock-routes"
import { useMapStore } from "@/stores/mapStore"

vi.mock("@/stores/mapStore", () => ({
  useMapStore: vi.fn(),
}))

describe("PlanPanel", () => {
  it("renders current route actions", () => {
    ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: unknown) => unknown) =>
        selector({
          currentRoute: silkRoadRoute,
          setCurrentRoute: vi.fn(),
          editingPointId: null,
          setEditingPointId: vi.fn(),
          startPointLocationSelection: vi.fn(),
          pointSelectionDraft: null,
          setPointSelectionDraft: vi.fn(),
          setAddPointMode: vi.fn(),
        })
    )

    render(<PlanPanel searchQuery="" />)
    expect(screen.getByText("丝绸之路")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "地图选点" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "保存变更" })).toBeInTheDocument()
  })
})
