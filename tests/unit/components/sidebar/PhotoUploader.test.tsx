import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import PhotoUploader from "@/components/sidebar/PhotoUploader"

const { exifMocks, storeState } = vi.hoisted(() => ({
  exifMocks: {
    parseExifGps: vi.fn(),
    readFileAsDataURL: vi.fn(),
    wgs84ToGcj02: vi.fn(),
  },
  storeState: {
    addPhotoShare: vi.fn(),
    startPhotoLocationSelection: vi.fn(),
    clearLocationSelection: vi.fn(),
    isSelectingLocation: false,
    locationSelectionMode: "none" as "none" | "photo" | "point",
  },
}))

vi.mock("@/lib/exif", () => exifMocks)

vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

describe("PhotoUploader", () => {
  it("clears the no-GPS prompt when photo location selection ends", async () => {
    exifMocks.readFileAsDataURL.mockResolvedValue("data:image/png;base64,abc")
    exifMocks.parseExifGps.mockResolvedValue(null)
    storeState.startPhotoLocationSelection.mockImplementation(() => {
      storeState.isSelectingLocation = true
      storeState.locationSelectionMode = "photo"
    })

    const { container, rerender } = render(<PhotoUploader />)
    const fileInput = container.querySelector("input[type='file']")
    if (!fileInput) throw new Error("Photo input not found")

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["photo"], "photo.png", { type: "image/png" })],
      },
    })

    await waitFor(() => {
      expect(storeState.startPhotoLocationSelection).toHaveBeenCalledWith(
        "data:image/png;base64,abc"
      )
    })
    rerender(<PhotoUploader />)

    expect(
      screen.getByText("照片没有 GPS 信息，请在地图上点击选择位置")
    ).toBeInTheDocument()

    storeState.isSelectingLocation = false
    storeState.locationSelectionMode = "none"
    rerender(<PhotoUploader />)

    await waitFor(() => {
      expect(
        screen.queryByText("照片没有 GPS 信息，请在地图上点击选择位置")
      ).not.toBeInTheDocument()
    })
  })
})
