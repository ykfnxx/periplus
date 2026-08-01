import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { silkRoadJourney } from "@/lib/mock-journeys"
import {
  withWorkspaceState,
  workspaceDocumentForStory,
} from "@/tests/storybook/workspace-story"
import RoutePreview from "./RoutePreview"

const meta = {
  title: "Workbench/RoutePreview",
  component: RoutePreview,
  decorators: [
    (Story) => (
      <div className="h-[720px] w-[380px] overflow-auto rounded-2xl border border-ink-15 bg-soft-white shadow-periplus">
        <Story />
      </div>
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

export const Empty: Story = {
  decorators: [withWorkspaceState({ workspaceDocument: null })],
}
