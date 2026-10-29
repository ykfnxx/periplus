import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { dispatchMapIntent } from "@/modules/workspace/ui/WorkspaceController"
import RealMapStoryCanvas from "@/tests/storybook/map-story"
import { planningJourney } from "@/tests/storybook/journey-fixtures"
import {
  withWorkspaceState,
  workspaceDocumentForStory,
} from "@/tests/storybook/workspace-story"
import RoutePolyline from "./RoutePolyline"
const meta = {
  title: "Map/RoutePolyline",
  component: RoutePolyline,
  parameters: { layout: "fullscreen", a11y: { test: "off" } },
  tags: ["map-integration", "!test", "!autodocs"],
  render: () => (
    <RealMapStoryCanvas
      title="事件内路线快照"
      description="地图只读取服务端选定的 plans[0]；此处为 Storybook 示例。"
    >
      <RoutePolyline onIntent={dispatchMapIntent} />
    </RealMapStoryCanvas>
  ),
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(planningJourney),
      selectedEventId: "train-to-shanghai",
      mapFocusRequest: {
        requestId: 1,
        target: { type: "transit", eventId: "train-to-shanghai", maxZoom: 13 },
      },
    }),
  ],
} satisfies Meta<typeof RoutePolyline>
export default meta
type Story = StoryObj<typeof meta>
export const SelectedRoute: Story = {}
export const MissingRoute: Story = {
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory({
        ...planningJourney,
        events: singleEvents(),
      }),
    }),
  ],
}
function singleEvents() {
  return planningJourney.events.map((event) => ({
    ...event,
    transit: undefined,
  }))
}
