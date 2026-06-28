import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import PhotoMaterials from "@/components/workbench/PhotoMaterials"

const setSelectedPhotoShare = vi.fn()

vi.mock("@/stores/mapStore", () => ({
  useMapStore: (selector: (state: unknown) => unknown) =>
    selector({
      photoShares: [
        {
          id: "photo-1",
          lat: 1,
          lng: 2,
          imageDataUrl: "data:image/png;base64,abc",
          caption: "日落",
          createdAt: 1,
        },
      ],
      setSelectedPhotoShare,
    }),
}))

vi.mock("@/components/sidebar/PhotoUploader", () => ({
  default: () => <div />,
}))

describe("PhotoMaterials", () => {
  it("renders photo materials with photo alt text", () => {
    render(<PhotoMaterials />)

    expect(screen.getByText("照片素材")).toBeInTheDocument()
    expect(screen.getByAltText("日落")).toBeInTheDocument()
  })
})
