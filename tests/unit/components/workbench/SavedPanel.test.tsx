import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import SavedPanel from "@/components/workbench/SavedPanel"
import { listRoutes } from "@/lib/routes/client"
import { useMapStore } from "@/stores/mapStore"

vi.mock("@/lib/routes/client", () => ({
  listRoutes: vi.fn(),
}))

vi.mock("@/stores/mapStore", () => ({
  useMapStore: vi.fn(),
}))

describe("SavedPanel", () => {
  it("selects a saved route and switches to plan", async () => {
    const savedRoute = {
      id: "saved-1",
      name: "Saved Northwest",
      description: "Saved route",
      points: [
        { id: "p1", name: "敦煌", lat: 40.1421, lng: 94.6619, order: 0 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    vi.mocked(listRoutes).mockResolvedValueOnce([savedRoute])

    const setCurrentRoute = vi.fn()
    const setActiveWorkbenchTool = vi.fn()
    ;(useMapStore as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (selector: (s: unknown) => unknown) =>
        selector({ setCurrentRoute, setActiveWorkbenchTool })
    )

    render(<SavedPanel />)

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Saved Northwest/ })
      ).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole("button", { name: /Saved Northwest/ }))
    expect(setCurrentRoute).toHaveBeenCalledWith(savedRoute)
    expect(setActiveWorkbenchTool).toHaveBeenCalledWith("plan")
  })
})
