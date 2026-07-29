import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, within } from "storybook/test"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { silkRoadRouteWithPlans } from "@/tests/storybook/route-fixtures"
import { withWorkspaceState } from "@/tests/storybook/workspace-story"
import type { DraftRoute, PathEdge } from "@/types/route"
import RoutePreview from "./RoutePreview"

const meta = {
  title: "Workbench/RoutePreview",
  component: RoutePreview,
  decorators: [
    (Story) => (
      <div className="h-[720px] w-[380px] overflow-auto rounded-2xl border border-ink-15 bg-soft-white shadow-periplus">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoutePreview>

export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {
  decorators: [
    withWorkspaceState({
      draftRoute: silkRoadRouteWithPlans,
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText("行程总览")).toBeInTheDocument()
    await expect(canvas.getAllByText(/公里/).length).toBeGreaterThan(0)
    await userEvent.click(canvas.getByRole("button", { name: "查看城市 西安" }))

    await expect(useWorkspaceStore.getState().viewLevel).toBe("city")
    await expect(useWorkspaceStore.getState().activeRouteNodeId).toBe(
      "node-xian"
    )
    await expect(useWorkspaceStore.getState().mapFocusRequest?.target).toEqual({
      type: "active-route",
      maxZoom: 15,
    })
  },
}

export const CityLevel: Story = {
  decorators: [
    withWorkspaceState({
      draftRoute: silkRoadRouteWithPlans,
      viewLevel: "city",
      activeRouteNodeId: "node-xian",
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const firstNode = canvas.getByRole("button", { name: "选择节点 西安城墙" })
    await userEvent.click(firstNode)

    await expect(firstNode).toHaveAttribute("aria-current", "true")
    await expect(useWorkspaceStore.getState().mapFocusRequest?.target).toEqual({
      type: "node",
      nodeId: "subnode-xian-city-wall",
      zoom: 15,
    })
  },
}

export const AlternativeSelected: Story = {
  decorators: [
    withWorkspaceState({
      draftRoute: silkRoadRouteWithPlans,
      viewLevel: "city",
      activeRouteNodeId: "node-xian",
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const edgeButton = canvas.getByRole("button", { name: "路线段 出租车" })
    await expect(
      canvas.queryByRole("button", { name: "选择少走拥堵" })
    ).not.toBeInTheDocument()

    await userEvent.click(edgeButton)
    await expect(
      canvas.getByRole("button", { name: "选择少走拥堵" })
    ).toBeInTheDocument()
    await expect(useWorkspaceStore.getState().selectedEdgeId).toBe(
      "subedge-xian-1"
    )
    await expect(useWorkspaceStore.getState().mapFocusRequest?.target).toEqual({
      type: "edge",
      edgeId: "subedge-xian-1",
      maxZoom: 14,
    })
  },
}

export const Planning: Story = {
  decorators: [
    withWorkspaceState({
      draftRoute: routeWithXianEdgeState({
        planningStatus: "PLANNING",
        plans: [],
        selectedPlanId: undefined,
      }),
      viewLevel: "city",
      activeRouteNodeId: "node-xian",
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText("正在规划真实路线")).toBeInTheDocument()
  },
}

export const Failed: Story = {
  decorators: [
    withWorkspaceState({
      draftRoute: routeWithXianEdgeState({
        planningStatus: "FAILED",
        planningWarning: "暂时无法获取真实路线，请稍后重试",
        plans: [],
        selectedPlanId: undefined,
      }),
      viewLevel: "city",
      activeRouteNodeId: "node-xian",
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText("暂时无法获取真实路线，请稍后重试")
    ).toBeInTheDocument()
  },
}

export const Stale: Story = {
  decorators: [
    withWorkspaceState({
      draftRoute: routeWithXianEdgeState({
        planningStatus: "STALE",
        planningWarning: "路线数据已过期，正在重新规划",
      }),
      viewLevel: "city",
      activeRouteNodeId: "node-xian",
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText("正在更新路线，暂时显示上次结果")
    ).toBeInTheDocument()
    await expect(
      canvas.getByText("路线数据已过期，正在重新规划")
    ).toBeInTheDocument()
  },
}

export const EmptyRoute: Story = {
  decorators: [
    withWorkspaceState({
      draftRoute: {
        ...silkRoadRouteWithPlans,
        nodes: [],
        edges: [],
        subPlans: [],
      },
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByText("路线尚无地点，可以在 AI 面板中添加第一站。")
    ).toBeInTheDocument()
  },
}

export const Empty: Story = {
  decorators: [
    withWorkspaceState({
      draftRoute: null,
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText("暂无路线预览")).toBeInTheDocument()
  },
}

function routeWithXianEdgeState(edgeState: Partial<PathEdge>): DraftRoute {
  return {
    ...silkRoadRouteWithPlans,
    subPlans: silkRoadRouteWithPlans.subPlans.map((subPlan) =>
      subPlan.routeNodeId === "node-xian"
        ? {
            ...subPlan,
            edges: subPlan.edges.map((edge, index) =>
              index === 0 ? { ...edge, ...edgeState } : edge
            ),
          }
        : subPlan
    ),
  }
}
