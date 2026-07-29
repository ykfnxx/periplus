import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, waitFor, within } from "storybook/test"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { dispatchMapIntent } from "@/modules/workspace/ui/WorkspaceController"
import { silkRoadRouteWithPlans } from "@/tests/storybook/route-fixtures"
import { withWorkspaceState } from "@/tests/storybook/workspace-story"
import MapSurface from "./MapSurface"

function RealMapStatus() {
  const mapReady = useWorkspaceStore((state) => state.mapReady)
  const mapError = useWorkspaceStore((state) => state.mapError)

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute top-4 left-4 z-50 rounded-full border border-ink-15 bg-soft-white/95 px-3 py-2 text-xs font-bold text-ink shadow-periplus-soft backdrop-blur-sm"
    >
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

async function waitForRealMap() {
  await waitFor(
    () => {
      expect(useWorkspaceStore.getState().mapError).toBeNull()
      expect(useWorkspaceStore.getState().mapReady).toBe(true)
    },
    { timeout: 20_000 }
  )

  const map = useWorkspaceStore.getState().map
  expect(map).not.toBeNull()
  return map!
}

const meta = {
  title: "Map/MapSurface",
  component: MapSurface,
  parameters: {
    layout: "fullscreen",
    a11y: {
      // 高德 SDK 生成的底图 DOM 不由本项目控制，业务覆盖层另行测试。
      test: "off",
    },
  },
  decorators: [
    withWorkspaceState({
      draftRoute: silkRoadRouteWithPlans,
    }),
  ],
  render: () => <RealMapStory />,
} satisfies Meta<typeof MapSurface>

export default meta
type Story = StoryObj<typeof meta>

export const RealOverview: Story = {
  tags: ["map-integration", "!test", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const map = await waitForRealMap()

    await waitFor(
      () => {
        expect(map.getAllOverlays("marker").length).toBeGreaterThan(0)
        expect(map.getAllOverlays("polyline").length).toBeGreaterThan(0)
        expect(
          canvas.getAllByRole("button", { name: /选择路线段/ }).length
        ).toBeGreaterThan(0)
      },
      { timeout: 10_000 }
    )
    await expect(canvas.getByText("真实地图已加载")).toBeInTheDocument()
  },
}

export const RealCityTransition: Story = {
  tags: ["map-integration", "!test", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const map = await waitForRealMap()

    await waitFor(
      () => {
        expect(map.getAllOverlays("marker").length).toBeGreaterThan(0)
      },
      { timeout: 10_000 }
    )

    const markers = map.getAllOverlays("marker") as AMap.Marker[]
    const xianMarker = markers.find((marker) => marker.getTitle() === "西安")
    expect(xianMarker).toBeDefined()
    xianMarker!.emit("click", {
      stopPropagation() {},
    })

    await waitFor(() => {
      const state = useWorkspaceStore.getState()
      expect(state.viewLevel).toBe("city")
      expect(state.activeRouteNodeId).toBe("node-xian")
      expect(state.mapFocusRequest?.target).toEqual({
        type: "active-route",
        maxZoom: 15,
      })
    })
    await expect(
      canvas.getByRole("button", { name: "概览" })
    ).toBeInTheDocument()
  },
}
