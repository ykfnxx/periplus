import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, waitFor } from "storybook/test"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { dispatchMapIntent } from "@/modules/workspace/ui/WorkspaceController"
import { silkRoadJourneyWithPlans } from "@/tests/storybook/route-fixtures"
import { withWorkspaceState } from "@/tests/storybook/workspace-story"
import MapSurface from "./MapSurface"

function RealMapStatus() {
  const mapReady = useWorkspaceStore((state) => state.mapReady)
  const mapError = useWorkspaceStore((state) => state.mapError)
  return (
    <div className="pointer-events-none absolute top-4 left-4 z-50 rounded-full border border-ink-15 bg-soft-white/95 px-3 py-2 text-xs font-bold text-ink shadow-periplus-soft">
      {mapError ?? (mapReady ? "真实地图已加载" : "正在加载真实地图")}
    </div>
  )
}

function RealMapStory() {
  return (
    <div className="relative h-screen min-h-[600px] w-screen overflow-hidden bg-cream">
      <MapSurface onIntent={dispatchMapIntent} />
      <RealMapStatus />
    </div>
  )
}

const meta = {
  title: "Map/MapSurface",
  component: MapSurface,
  parameters: {
    layout: "fullscreen",
    a11y: { test: "off" },
  },
  decorators: [withWorkspaceState({ draftJourney: silkRoadJourneyWithPlans })],
  render: () => <RealMapStory />,
} satisfies Meta<typeof MapSurface>

export default meta
type Story = StoryObj<typeof meta>

export const RealOverview: Story = {
  tags: ["map-integration", "!test", "!autodocs"],
  play: async () => {
    await waitFor(
      () => {
        expect(useWorkspaceStore.getState().mapError).toBeNull()
        expect(useWorkspaceStore.getState().mapReady).toBe(true)
      },
      { timeout: 20_000 }
    )
  },
}
