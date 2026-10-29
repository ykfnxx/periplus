import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { dispatchMapIntent } from "@/modules/workspace/ui/WorkspaceController"
import RealMapStoryCanvas from "@/tests/storybook/map-story"
import { singleChainJourney } from "@/tests/storybook/journey-fixtures"
import {
  withWorkspaceState,
  workspaceDocumentForStory,
} from "@/tests/storybook/workspace-story"
import RouteMarkers from "./RouteMarkers"
const meta = {
  title: "Map/RouteMarkers",
  component: RouteMarkers,
  parameters: { layout: "fullscreen", a11y: { test: "off" } },
  tags: ["map-integration", "!test", "!autodocs"],
  render: () => (
    <RealMapStoryCanvas
      title="完整事件链的地点"
      description="序号与事件链一致，跨城与回访同城不合并。"
    >
      <RouteMarkers onIntent={dispatchMapIntent} />
    </RealMapStoryCanvas>
  ),
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(singleChainJourney),
      mapFocusRequest: {
        requestId: 1,
        target: { type: "active-journey", maxZoom: 13 },
      },
    }),
  ],
} satisfies Meta<typeof RouteMarkers>
export default meta
type Story = StoryObj<typeof meta>
export const WholeJourney: Story = {}
export const SelectedEvent: Story = {
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(singleChainJourney),
      selectedEventId: "hangzhou-return",
    }),
  ],
}
