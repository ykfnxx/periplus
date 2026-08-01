import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PhotoLightbox from "@/modules/workbench/ui/PhotoLightbox"

const { photoClientMocks, storeState } = vi.hoisted(() => ({
  photoClientMocks: {
    deletePhoto: vi.fn(),
  },
  storeState: {
    workspaceDocument: {
      accessState: "OWNER",
      draftState: "DIRTY",
      session: { status: "ACTIVE" },
    },
    lightboxPhotoShare: {
      id: "photo-1",
      ownerId: "owner-1",
      ownerName: "Owner",
      lat: 36.0611,
      lng: 103.8343,
      imageDataUrl: "data:image/jpeg;base64,abc",
      caption: "兰州",
      createdAt: Date.UTC(2026, 6, 29),
      updatedAt: Date.UTC(2026, 6, 29),
      canDelete: true,
    },
    setLightboxPhotoShare: vi.fn(),
    removePhotoShare: vi.fn(),
  },
}))

vi.mock("@/modules/data/photos/client", () => photoClientMocks)

vi.mock("@/modules/workspace/state/workspace-store", () => ({
  useWorkspaceStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

describe("PhotoLightbox", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.workspaceDocument.accessState = "OWNER"
    storeState.workspaceDocument.draftState = "DIRTY"
    storeState.workspaceDocument.session.status = "ACTIVE"
  })

  it("blocks photo deletion when the Workspace is expired", () => {
    storeState.workspaceDocument.accessState = "EXPIRED"
    storeState.workspaceDocument.session.status = "EXPIRED"

    render(<PhotoLightbox />)

    const deleteButton = screen.getByRole("button", { name: "删除照片" })
    expect(deleteButton).toBeDisabled()
    fireEvent.click(deleteButton)
    expect(photoClientMocks.deletePhoto).not.toHaveBeenCalled()
    expect(storeState.removePhotoShare).not.toHaveBeenCalled()
  })
})
