import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { silkRoadJourney } from "@/lib/mock-journeys"
import {
  withWorkspaceState,
  workspaceDocumentForStory,
} from "@/tests/storybook/workspace-story"
import MapRouteLevelControls from "./MapRouteLevelControls"

const meta = {
  title: "Map/MapRouteLevelControls",
  component: MapRouteLevelControls,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-[320px] w-full overflow-hidden bg-bluegray/20">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MapRouteLevelControls>

export default meta
type Story = StoryObj<typeof meta>

export const Section: Story = {
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(silkRoadJourney),
      viewLevel: "section",
      activeSectionEventId: "section-xian",
    }),
  ],
}
