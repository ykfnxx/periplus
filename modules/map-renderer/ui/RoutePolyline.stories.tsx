import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { dispatchMapIntent } from "@/modules/workspace/ui/WorkspaceController"
import RealMapStoryCanvas from "@/tests/storybook/map-story"
import {
  dunhuangRouteStoryEventIds,
  dunhuangRouteStoryJourney,
} from "@/tests/storybook/route-fixtures"
import {
  withWorkspaceState,
  workspaceDocumentForStory,
} from "@/tests/storybook/workspace-story"
import RouteMarkers from "./RouteMarkers"
import RoutePolyline from "./RoutePolyline"

function PolylineStory({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <RealMapStoryCanvas title={title} description={description}>
      <RoutePolyline onIntent={dispatchMapIntent} />
      <RouteMarkers onIntent={dispatchMapIntent} />
    </RealMapStoryCanvas>
  )
}

function stateForTransit(eventId: string) {
  return {
    workspaceDocument: workspaceDocumentForStory(dunhuangRouteStoryJourney),
    viewLevel: "section" as const,
    activeSectionEventId: "section-dunhuang",
    selectedTransitEventId: eventId,
    mapFocusRequest: {
      requestId: 1,
      target: { type: "transit" as const, eventId, maxZoom: 14 },
    },
  }
}

const meta = {
  title: "Map/RoutePolyline",
  component: RoutePolyline,
  parameters: {
    layout: "fullscreen",
    a11y: { test: "off" },
  },
  tags: ["map-integration", "!test", "!autodocs"],
} satisfies Meta<typeof RoutePolyline>

export default meta
type Story = StoryObj<typeof meta>

export const NormalRoute: Story = {
  decorators: [
    withWorkspaceState(stateForTransit(dunhuangRouteStoryEventIds.normal)),
  ],
  render: () => (
    <PolylineStory
      title="正常导航路线"
      description="真实坐标序列绘制为选中实线；同一 CITY 中其他路线降为弱化上下文。"
    />
  ),
}

export const MultiSegmentRoute: Story = {
  decorators: [
    withWorkspaceState(
      stateForTransit(dunhuangRouteStoryEventIds.multiSegment)
    ),
  ],
  render: () => (
    <PolylineStory
      title="多段导航路线"
      description="步行、公交、步行三个生产 TransitSegment 连续绘制，换乘点沿用生产 marker。"
    />
  ),
}

export const MissingGeometryFallback: Story = {
  decorators: [
    withWorkspaceState(stateForTransit(dunhuangRouteStoryEventIds.fallback)),
  ],
  render: () => (
    <PolylineStory
      title="无路线数据降级"
      description="Transit 尚无 provider geometry 时，以低强调虚线连接真实起终点，不阻断预览。"
    />
  ),
}
