import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, within } from "storybook/test"
import { silkRoadRoute } from "@/lib/mock-routes"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { withWorkspaceState } from "@/tests/storybook/workspace-story"
import MapRouteLevelControls from "./MapRouteLevelControls"

const meta = {
  title: "Map/MapRouteLevelControls",
  component: MapRouteLevelControls,
  parameters: {
    layout: "fullscreen",
  },
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

export const CityLevel: Story = {
  decorators: [
    withWorkspaceState({
      draftRoute: silkRoadRoute,
      viewLevel: "city",
      activeRouteNodeId: "node-xian",
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const overviewButton = canvas.getByRole("button", { name: "概览" })

    await expect(canvas.getByText("西安")).toBeInTheDocument()
    await userEvent.click(overviewButton)
    await expect(
      canvas.queryByRole("button", { name: "概览" })
    ).not.toBeInTheDocument()
    await expect(useWorkspaceStore.getState().mapFocusRequest?.target).toEqual({
      type: "active-route",
      maxZoom: 12,
    })
  },
}
