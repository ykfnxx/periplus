import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { silkRoadJourney } from "@/lib/mock-journeys"
import {
  withWorkspaceState,
  workspaceDocumentForStory,
} from "@/tests/storybook/workspace-story"
import OverlayScrollArea from "./OverlayScrollArea"
import RoutePreview from "./RoutePreview"

const meta = {
  title: "Workbench/RoutePreview",
  component: RoutePreview,
  decorators: [
    (Story) => (
      <OverlayScrollArea className="h-[720px] w-[380px] rounded-2xl border border-ink-15 bg-soft-white shadow-periplus">
        <Story />
      </OverlayScrollArea>
    ),
  ],
} satisfies Meta<typeof RoutePreview>

export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(silkRoadJourney),
    }),
  ],
}

export const Section: Story = {
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(silkRoadJourney),
      viewLevel: "section",
      activeSectionEventId: "section-xian",
    }),
  ],
}

export const DateNavigation: Story = {
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(silkRoadJourney),
      viewLevel: "section",
      activeSectionEventId: "section-dunhuang",
    }),
  ],
}

const galleryPhotoShares = [
  {
    id: "gallery-warm",
    ownerId: "storybook-owner",
    ownerName: "Storybook",
    lat: 34.2655,
    lng: 108.9531,
    imageDataUrl:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='960' height='480'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' x2='1'%3E%3Cstop stop-color='%23b8593e'/%3E%3Cstop offset='1' stop-color='%23e4b45f'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='960' height='480' fill='url(%23g)'/%3E%3Ccircle cx='700' cy='135' r='72' fill='%23fff4d6' fill-opacity='.75'/%3E%3C/svg%3E",
    caption: "暖色建筑",
    createdAt: 1,
    canDelete: true,
  },
  {
    id: "gallery-cool",
    ownerId: "storybook-owner",
    ownerName: "Storybook",
    lat: 34.2655,
    lng: 108.9531,
    imageDataUrl:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='960' height='480'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='0' y2='1'%3E%3Cstop stop-color='%23557768'/%3E%3Cstop offset='1' stop-color='%23bfd0aa'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='960' height='480' fill='url(%23g)'/%3E%3Cpath d='M0 390L210 210 370 330 570 165 780 355 960 240V480H0Z' fill='%232f433b' fill-opacity='.58'/%3E%3C/svg%3E",
    caption: "远山",
    createdAt: 2,
    canDelete: true,
  },
]

export const ImageGallery: Story = {
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(silkRoadJourney),
      viewLevel: "section",
      activeSectionEventId: "section-xian",
      photoShares: galleryPhotoShares,
    }),
  ],
}

export const Empty: Story = {
  decorators: [withWorkspaceState({ workspaceDocument: null })],
}
