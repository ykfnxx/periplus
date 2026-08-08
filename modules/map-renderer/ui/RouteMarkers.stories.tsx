import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { dispatchMapIntent } from "@/modules/workspace/ui/WorkspaceController"
import RealMapStoryCanvas from "@/tests/storybook/map-story"
import {
  dunhuangRouteStoryJourney,
  selectedDayTwoMarker,
  selectedUnscheduledMarker,
} from "@/tests/storybook/route-fixtures"
import {
  withWorkspaceState,
  workspaceDocumentForStory,
} from "@/tests/storybook/workspace-story"
import RouteMarkers from "./RouteMarkers"

function MarkerStory({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <RealMapStoryCanvas title={title} description={description}>
      <RouteMarkers onIntent={dispatchMapIntent} />
    </RealMapStoryCanvas>
  )
}

const sharedState = {
  workspaceDocument: workspaceDocumentForStory(dunhuangRouteStoryJourney),
  viewLevel: "section" as const,
  activeSectionEventId: "section-dunhuang",
  mapFocusRequest: {
    requestId: 1,
    target: { type: "active-journey" as const, maxZoom: 13 },
  },
}

const meta = {
  title: "Map/RouteMarkers",
  component: RouteMarkers,
  parameters: {
    layout: "fullscreen",
    a11y: { test: "off" },
  },
  tags: ["map-integration", "!test", "!autodocs"],
} satisfies Meta<typeof RouteMarkers>

export default meta
type Story = StoryObj<typeof meta>

export const DayThemes: Story = {
  decorators: [withWorkspaceState(sharedState)],
  render: () => (
    <MarkerStory
      title="多日主题色"
      description="白色序号按完整 CITY 事件链的位置生成，不按天重置；第 1 天为鲜橙、第 2 天为薄荷绿，未排期为中性蓝灰。"
    />
  ),
}

export const SelectedMarker: Story = {
  decorators: [
    withWorkspaceState({
      ...sharedState,
      selectedLocationEvent: selectedDayTwoMarker,
    }),
  ],
  render: () => (
    <MarkerStory
      title="选中态"
      description="序号 7 保留第 2 天主题色，并只用加粗描边与放大反馈表达选中。"
    />
  ),
}

export const UnscheduledMarker: Story = {
  decorators: [
    withWorkspaceState({
      ...sharedState,
      selectedLocationEvent: selectedUnscheduledMarker,
    }),
  ],
  render: () => (
    <MarkerStory
      title="未排期中性色"
      description="无法推导属于第几天的地点不猜测归属；序号 10 使用中性蓝灰，此 Story 同时展示其选中态。"
    />
  ),
}
