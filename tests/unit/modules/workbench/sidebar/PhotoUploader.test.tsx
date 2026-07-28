import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PhotoUploader from "@/modules/workbench/ui/sidebar/PhotoUploader"

const { storeState } = vi.hoisted(() => ({
  storeState: {
    setUploadModalOpen: vi.fn(),
  },
}))

vi.mock("@/modules/workspace/state/workspace-store", () => ({
  useWorkspaceStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

describe("PhotoUploader", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("opens the photo upload composer", () => {
    render(<PhotoUploader />)

    fireEvent.click(screen.getByRole("button", { name: "添加照片素材" }))

    expect(storeState.setUploadModalOpen).toHaveBeenCalledWith(true)
  })
})
