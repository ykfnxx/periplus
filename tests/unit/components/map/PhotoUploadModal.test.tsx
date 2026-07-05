import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import PhotoUploadModal from "@/components/map/PhotoUploadModal"

const { exifMocks, storeState } = vi.hoisted(() => ({
  exifMocks: {
    parseExifGps: vi.fn(),
    readFileAsDataURL: vi.fn(),
    wgs84ToGcj02: vi.fn(),
  },
  storeState: {
    uploadModalOpen: true,
    setUploadModalOpen: vi.fn(),
    uploadStep: 1,
    setUploadStep: vi.fn(),
    uploadPhotos: [] as { id: string; file: File; previewUrl: string; lat?: number; lng?: number; caption?: string; hasGPS: boolean }[],
    setUploadPhotos: vi.fn(),
    addUploadPhoto: vi.fn(),
    updateUploadPhoto: vi.fn(),
    clearUploadState: vi.fn(),
    addPhotoShare: vi.fn(),
    map: null,
  },
}))

vi.mock("@/lib/exif", () => exifMocks)

vi.mock("@/lib/photos/client", () => ({
  photoDtoToShare: vi.fn((dto) => ({ ...dto, imageDataUrl: dto.url })),
  uploadPhoto: vi.fn(),
}))

vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

describe("PhotoUploadModal", () => {
  it("renders step 1 with file selection", () => {
    storeState.uploadStep = 1
    storeState.uploadPhotos = []
    render(<PhotoUploadModal />)

    expect(screen.getByRole("heading", { name: "选择照片" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "选择照片" })).toBeInTheDocument()
  })

  it("proceeds to step 2 when photos without GPS need location", async () => {
    storeState.uploadStep = 1
    storeState.uploadPhotos = [
      {
        id: "photo-1",
        file: new File(["photo"], "photo.jpg", { type: "image/jpeg" }),
        previewUrl: "data:image/jpeg;base64,abc",
        hasGPS: false,
      },
    ]
    storeState.setUploadStep = vi.fn((step) => {
      storeState.uploadStep = step
    })

    const { rerender } = render(<PhotoUploadModal />)
    const nextButton = screen.getByText("下一步")
    fireEvent.click(nextButton)

    await waitFor(() => {
      expect(storeState.setUploadStep).toHaveBeenCalledWith(2)
    })

    storeState.uploadStep = 2
    rerender(<PhotoUploadModal />)

    expect(
      screen.getByText("以下照片缺少 GPS 信息，请在地图上点击选择位置")
    ).toBeInTheDocument()
  })

  it("proceeds to step 3 for adding captions", async () => {
    storeState.uploadStep = 2
    storeState.uploadPhotos = [
      {
        id: "photo-1",
        file: new File(["photo"], "photo.jpg", { type: "image/jpeg" }),
        previewUrl: "data:image/jpeg;base64,abc",
        lat: 39.9042,
        lng: 116.4074,
        hasGPS: false,
      },
    ]
    storeState.setUploadStep = vi.fn((step) => {
      storeState.uploadStep = step
    })

    const { rerender } = render(<PhotoUploadModal />)
    const nextButton = screen.getByText("下一步")
    fireEvent.click(nextButton)

    await waitFor(() => {
      expect(storeState.setUploadStep).toHaveBeenCalledWith(3)
    })

    storeState.uploadStep = 3
    rerender(<PhotoUploadModal />)

    expect(screen.getByText("添加描述")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("添加描述...")).toBeInTheDocument()
  })

  it("closes modal when close button is clicked", () => {
    storeState.uploadStep = 1
    storeState.uploadPhotos = []
    render(<PhotoUploadModal />)

    const closeButton = screen.getByText("关闭")
    fireEvent.click(closeButton)

    expect(storeState.clearUploadState).toHaveBeenCalled()
  })

  it("does not render when modal is closed", () => {
    storeState.uploadModalOpen = false
    const { container } = render(<PhotoUploadModal />)
    expect(container.firstChild).toBeNull()
    storeState.uploadModalOpen = true
  })
})
