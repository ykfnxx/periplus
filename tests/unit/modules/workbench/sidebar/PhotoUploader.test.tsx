import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PhotoUploader from "@/modules/workbench/ui/sidebar/PhotoUploader"

const { storeState } = vi.hoisted(() => ({
  storeState: {
    workspaceDocument: {
      accessState: "OWNER",
      draftState: "DIRTY",
      session: { status: "ACTIVE" },
    },
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
    storeState.workspaceDocument.accessState = "OWNER"
    storeState.workspaceDocument.draftState = "DIRTY"
    storeState.workspaceDocument.session.status = "ACTIVE"
  })

  it("opens the photo upload composer", () => {
    render(<PhotoUploader />)

    fireEvent.click(screen.getByRole("button", { name: "添加照片素材" }))

    expect(storeState.setUploadModalOpen).toHaveBeenCalledWith(true)
  })

  it("disables the upload entry for an expired Workspace", () => {
    storeState.workspaceDocument.accessState = "EXPIRED"
    render(<PhotoUploader />)

    const button = screen.getByRole("button", { name: "添加照片素材" })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(storeState.setUploadModalOpen).not.toHaveBeenCalled()
  })
})
