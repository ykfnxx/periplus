import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { singleChainJourney } from "@/tests/storybook/journey-fixtures"
import {
  withWorkspaceState,
  workspaceDocumentForStory,
} from "@/tests/storybook/workspace-story"
import MapJourneySummary from "./MapJourneySummary"
const meta = {
  title: "Map/MapJourneySummary",
  component: MapJourneySummary,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="relative h-80 w-full bg-bluegray/20">
        <Story />
      </div>
    ),
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(singleChainJourney),
    }),
  ],
} satisfies Meta<typeof MapJourneySummary>
export default meta
type Story = StoryObj<typeof meta>
export const Journey: Story = {}
