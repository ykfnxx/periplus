import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { dispatchMapIntent } from "@/modules/workspace/ui/WorkspaceController"
import RealMapStoryCanvas from "@/tests/storybook/map-story"
import {
  fiveDayMarkerStoryJourney,
  selectedDayFiveMarker,
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
  workspaceDocument: workspaceDocumentForStory(fiveDayMarkerStoryJourney),
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
      description="白色序号按完整 CITY 事件链的位置生成，不按天重置；此场景同时展示前 5 天互不重复的主题色，以及未排期的中性 teak。"
    />
  ),
}

export const SelectedMarker: Story = {
  decorators: [
    withWorkspaceState({
      ...sharedState,
      selectedLocationEvent: selectedDayFiveMarker,
    }),
  ],
  render: () => (
    <MarkerStory
      title="选中态"
      description="第 5 天 marker 保留独立主题色，并只用加粗描边与放大反馈表达选中。"
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
      description="无法推导属于第几天的地点不猜测归属；marker 与顶部标签、纵向轨统一使用中性 teak，此 Story 同时展示其选中态。"
    />
  ),
}
