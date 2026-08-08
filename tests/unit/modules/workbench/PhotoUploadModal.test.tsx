import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import PhotoUploadModal from "@/modules/workbench/ui/PhotoUploadModal"

type TestUploadPhoto = {
  id: string
  file: File
  previewUrl: string
  lat?: number
  lng?: number
  caption?: string
  hasGPS: boolean
}

const { exifMocks, photoClientMocks, storeState } = vi.hoisted(() => ({
  exifMocks: {
    parseExifGps: vi.fn(),
    readFileAsDataURL: vi.fn(),
    wgs84ToGcj02: vi.fn(),
  },
  photoClientMocks: {
    photoDtoToShare: vi.fn((dto) => ({ ...dto, imageDataUrl: dto.url })),
    uploadPhoto: vi.fn(),
  },
  storeState: {
    workspaceDocument: {
      accessState: "OWNER",
      draftState: "DIRTY",
      session: { status: "ACTIVE" },
    },
    mapReady: true,
    uploadModalOpen: true,
    uploadPhotos: [] as TestUploadPhoto[],
    setUploadPhotos: vi.fn(),
    addUploadPhoto: vi.fn(),
    updateUploadPhoto: vi.fn(),
    startUploadPhotoLocationSelection: vi.fn(),
    clearUploadState: vi.fn(),
    clearLocationSelection: vi.fn(),
    addPhotoShare: vi.fn(),
  },
}))

vi.mock("@/lib/exif", () => exifMocks)

vi.mock("@/modules/data/photos/client", () => photoClientMocks)

vi.mock("@/modules/workspace/state/workspace-store", () => ({
  useWorkspaceStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

function photoFixture(
  overrides: Partial<TestUploadPhoto> = {}
): TestUploadPhoto {
  return {
    id: "photo-1",
    file: new File(["photo"], "photo.jpg", { type: "image/jpeg" }),
    previewUrl: "data:image/jpeg;base64,abc",
    hasGPS: false,
    ...overrides,
  }
}

describe("PhotoUploadModal", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState.mapReady = true
    storeState.uploadModalOpen = true
    storeState.uploadPhotos = []
    storeState.workspaceDocument.accessState = "OWNER"
    storeState.workspaceDocument.draftState = "DIRTY"
    storeState.workspaceDocument.session.status = "ACTIVE"
  })

  it("renders the single upload composer", () => {
    render(<PhotoUploadModal />)

    expect(
      screen.getByRole("dialog", { name: "创建照片素材" })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "选择照片" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "上传" })).toBeDisabled()
  })

  it("starts map location selection for the active photo", () => {
    storeState.uploadPhotos = [photoFixture()]

    render(<PhotoUploadModal />)
    fireEvent.click(screen.getByRole("button", { name: "选择坐标" }))

    expect(storeState.startUploadPhotoLocationSelection).toHaveBeenCalledWith(
      "photo-1"
    )
  })

  it("updates caption for the active photo", () => {
    storeState.uploadPhotos = [photoFixture({ lat: 39.9042, lng: 116.4074 })]

    render(<PhotoUploadModal />)
    fireEvent.change(screen.getByPlaceholderText("添加描述..."), {
      target: { value: "在北京的照片" },
    })

    expect(storeState.updateUploadPhoto).toHaveBeenCalledWith("photo-1", {
      caption: "在北京的照片",
    })
  })

  it("uploads photos with coordinates", async () => {
    storeState.uploadPhotos = [
      photoFixture({ lat: 39.9042, lng: 116.4074, caption: "北京" }),
    ]
    photoClientMocks.uploadPhoto.mockResolvedValue({
      id: "server-photo-1",
      ownerId: "user-1",
      ownerName: "User",
      url: "/uploads/photos/photo.jpg",
      lat: 39.9042,
      lng: 116.4074,
      caption: "北京",
      createdAt: Date.now(),
      canDelete: true,
    })

    render(<PhotoUploadModal />)
    fireEvent.click(screen.getByRole("button", { name: "上传" }))

    await waitFor(() => {
      expect(photoClientMocks.uploadPhoto).toHaveBeenCalledWith({
        file: storeState.uploadPhotos[0].file,
        lat: 39.9042,
        lng: 116.4074,
        caption: "北京",
      })
      expect(storeState.addPhotoShare).toHaveBeenCalled()
      expect(storeState.clearUploadState).toHaveBeenCalled()
    })
  })

  it("closes the composer from the icon button", () => {
    render(<PhotoUploadModal />)

    fireEvent.click(screen.getByLabelText("关闭上传弹窗"))

    expect(storeState.clearLocationSelection).toHaveBeenCalled()
    expect(storeState.clearUploadState).toHaveBeenCalled()
  })

  it("does not render when modal is closed", () => {
    storeState.uploadModalOpen = false
    const { container } = render(<PhotoUploadModal />)
    expect(container.firstChild).toBeNull()
  })

  it("keeps upload mutations disabled for an archived Workspace", () => {
    storeState.workspaceDocument.session.status = "ARCHIVED"
    storeState.uploadPhotos = [
      photoFixture({ lat: 39.9042, lng: 116.4074, caption: "北京" }),
    ]

    render(<PhotoUploadModal />)

    expect(screen.getByRole("button", { name: "上传" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "重新选择" })).toBeDisabled()
    expect(screen.getByPlaceholderText("添加描述...")).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "上传" }))
    expect(photoClientMocks.uploadPhoto).not.toHaveBeenCalled()
  })
})
