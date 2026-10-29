import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { singleChainJourney } from "@/tests/storybook/journey-fixtures"
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
      workspaceDocument: workspaceDocumentForStory(singleChainJourney),
    }),
  ],
}

export const SelectedEvent: Story = {
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(singleChainJourney),
      selectedEventId: "hangzhou-return",
    }),
  ],
}

export const DateNavigation: Story = {
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(singleChainJourney),
    }),
  ],
}

export const Empty: Story = {
  decorators: [withWorkspaceState({ workspaceDocument: null })],
}
