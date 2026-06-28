import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import ExplorePanel from "@/components/workbench/ExplorePanel"
import { useMapStore } from "@/stores/mapStore"

vi.mock("@/stores/mapStore", () => ({
  useMapStore: vi.fn(),
}))

describe("ExplorePanel", () => {
  it("selects Silk Road and switches to plan", () => {
    const setCurrentRoute = vi.fn()
    const setActiveWorkbenchTab = vi.fn()
    ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: unknown) => unknown) =>
        selector({ setCurrentRoute, setActiveWorkbenchTab })
    )

    render(<ExplorePanel searchQuery="敦煌" />)
    fireEvent.click(screen.getByRole("button", { name: /丝绸之路/ }))
    expect(setCurrentRoute).toHaveBeenCalled()
    expect(setActiveWorkbenchTab).toHaveBeenCalledWith("plan")
  })
})
