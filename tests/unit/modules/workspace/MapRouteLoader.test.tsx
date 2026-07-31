import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, waitFor } from "@testing-library/react"
import { useSearchParams } from "next/navigation"
import MapRouteLoader from "@/modules/workspace/ui/MapRouteLoader"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

vi.mock("next/navigation", () => ({
  useSearchParams: vi.fn(),
}))

describe("MapRouteLoader", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("journey=preset-silk-road") as ReturnType<
        typeof useSearchParams
      >
    )
  })

  it("waits for the ready sender and loads a journey only once", async () => {
    const firstSender = vi.fn()
    const replacementSender = vi.fn()
    render(<MapRouteLoader />)

    expect(firstSender).not.toHaveBeenCalled()
    act(() => useWorkspaceStore.getState().setAgentSender(firstSender))
    await waitFor(() => {
      expect(firstSender).toHaveBeenCalledOnce()
    })
    expect(firstSender).toHaveBeenCalledWith(
      "draft.replace",
      expect.objectContaining({
        journey: expect.objectContaining({ id: "preset-silk-road" }),
      })
    )

    act(() => useWorkspaceStore.getState().setAgentSender(replacementSender))
    expect(replacementSender).not.toHaveBeenCalled()
  })
})
