import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, within } from "storybook/test"
import { silkRoadJourney } from "@/lib/mock-journeys"
import {
  withWorkspaceState,
  workspaceDocumentForStory,
} from "@/tests/storybook/workspace-story"
import PhotoLightbox from "./PhotoLightbox"

const meta = {
  title: "Workbench/PhotoLightbox",
  component: PhotoLightbox,
} satisfies Meta<typeof PhotoLightbox>

export default meta
type Story = StoryObj<typeof meta>

const expiredDocument = workspaceDocumentForStory(silkRoadJourney)
expiredDocument.accessState = "EXPIRED"
expiredDocument.session.status = "EXPIRED"

const lightboxPhotoShare = {
  id: "photo-lanzhou",
  ownerId: "storybook-owner",
  ownerName: "Storybook Owner",
  lat: 36.0611,
  lng: 103.8343,
  imageDataUrl:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='480'%3E%3Crect width='640' height='480' fill='%23d8b07a'/%3E%3C/svg%3E",
  caption: "兰州黄河风景",
  createdAt: Date.UTC(2026, 6, 29),
  updatedAt: Date.UTC(2026, 6, 29),
  canDelete: true,
}

export const ExpiredDeleteDisabled: Story = {
  decorators: [
    withWorkspaceState({
      workspaceDocument: expiredDocument,
      lightboxPhotoShare,
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const deleteButton = canvas.getByRole("button", { name: "删除照片" })
    await expect(deleteButton).toBeDisabled()
    await userEvent.click(deleteButton)
    await expect(deleteButton).toBeDisabled()
  },
}
