import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { silkRoadRoute } from "@/lib/mock-routes"
import RoutePreview from "@/modules/workbench/ui/RoutePreview"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { DraftRoute, RoutePlan } from "@/types/route"

const routePlans: RoutePlan[] = [
  {
    id: "plan-1",
    provider: "amap",
    rank: 0,
    label: "推荐方案",
    strategy: "recommended",
    durationSeconds: 1_440,
    distanceMeters: 8_800,
    trafficBasis: "TYPICAL",
    calculatedAt: "2026-07-29T00:00:00.000Z",
    requestFingerprint: "plan-1",
    segments: [],
  },
  {
    id: "plan-2",
    provider: "amap",
    rank: 1,
    label: "少走高速",
    strategy: "avoid-highway",
    durationSeconds: 1_680,
    distanceMeters: 9_400,
    trafficBasis: "TYPICAL",
    calculatedAt: "2026-07-29T00:00:00.000Z",
    requestFingerprint: "plan-2",
    segments: [],
  },
]

function routeWithPlans(): DraftRoute {
  return {
    ...silkRoadRoute,
    subPlans: silkRoadRoute.subPlans.map((subPlan) =>
      subPlan.id === "subplan-xian"
        ? {
            ...subPlan,
            edges: subPlan.edges.map((edge, index) =>
              index === 0
                ? {
                    ...edge,
                    planningStatus: "READY" as const,
                    selectedPlanId: "plan-1",
                    plans: routePlans,
                  }
                : edge
            ),
          }
        : subPlan
    ),
  }
}

describe("RoutePreview", () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
    Element.prototype.scrollIntoView = vi.fn()
  })

  it("renders a distinct empty state", () => {
    render(<RoutePreview />)
    expect(screen.getByText("暂无路线预览")).toBeInTheDocument()
  })

  it("distinguishes an empty route from the absence of a route", () => {
    useWorkspaceStore.getState().setDraftRoute({
      ...silkRoadRoute,
      nodes: [],
      edges: [],
      subPlans: [],
    })
    render(<RoutePreview />)

    expect(
      screen.getByText("路线尚无地点，可以在 AI 面板中添加第一站。")
    ).toBeInTheDocument()
    expect(screen.queryByText("暂无路线预览")).not.toBeInTheDocument()
  })

  it("renders route scope tabs and city summary rows in overview", () => {
    useWorkspaceStore.getState().setDraftRoute(silkRoadRoute)
    render(<RoutePreview />)

    expect(screen.getByRole("heading", { name: "丝绸之路" })).toBeInTheDocument()
    expect(
      screen.getByRole("tab", { name: "总览", selected: true })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "查看城市 西安" })
    ).toHaveTextContent("西安城墙 → 大雁塔 → 回民街")
    expect(screen.getByText("7 个城市")).toBeInTheDocument()
  })

  it("switches scope atomically and requests one active-route camera fit", () => {
    useWorkspaceStore.getState().setDraftRoute(silkRoadRoute)
    useWorkspaceStore.setState({ mapFocusRequest: null })
    render(<RoutePreview />)

    fireEvent.click(screen.getByRole("tab", { name: "西安" }))

    expect(useWorkspaceStore.getState()).toMatchObject({
      viewLevel: "city",
      activeRouteNodeId: "node-xian",
      selectedEdgeId: null,
      selectedLocationPoint: null,
      mapFocusRequest: {
        target: { type: "active-route", maxZoom: 15 },
      },
    })
  })

  it("returns the itinerary scroll container to the top after scope changes", () => {
    useWorkspaceStore.getState().setDraftRoute(silkRoadRoute)
    const { container } = render(
      <div className="periplus-chat-scroll">
        <RoutePreview />
      </div>
    )
    const scrollContainer = container.firstElementChild as HTMLElement
    scrollContainer.scrollTop = 240

    fireEvent.click(screen.getByRole("tab", { name: "西安" }))

    expect(scrollContainer.scrollTop).toBe(0)
  })

  it("renders the city timeline and selects a node with map focus", () => {
    useWorkspaceStore.getState().setDraftRoute(silkRoadRoute)
    useWorkspaceStore.getState().enterCityView("node-xian")
    useWorkspaceStore.setState({ mapFocusRequest: null })
    render(<RoutePreview />)

    expect(
      screen.getByRole("tab", { name: "西安", selected: true })
    ).toBeInTheDocument()
    expect(
      screen.getByRole("button", { name: "选择节点 西安城墙" })
    ).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "路线段 出租车" })).toHaveTextContent(
      "24 分钟 · 8.8 公里"
    )

    fireEvent.click(
      screen.getByRole("button", { name: "选择节点 西安城墙" })
    )

    expect(useWorkspaceStore.getState().selectedLocationPoint?.id).toBe(
      "subnode-xian-city-wall"
    )
    expect(useWorkspaceStore.getState().mapFocusRequest?.target).toEqual({
      type: "node",
      nodeId: "subnode-xian-city-wall",
      zoom: 15,
    })
  })

  it("shows alternatives only after selecting their route edge", () => {
    useWorkspaceStore.getState().setDraftRoute(routeWithPlans())
    useWorkspaceStore.getState().enterCityView("node-xian")
    render(<RoutePreview />)

    expect(
      screen.queryByRole("button", { name: "选择少走高速" })
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "路线段 出租车" }))
    fireEvent.click(screen.getByRole("button", { name: "选择少走高速" }))

    const selectedEdge =
      useWorkspaceStore.getState().draftRoute?.subPlans[0].edges[0]
    expect(selectedEdge?.selectedPlanId).toBe("plan-2")
    expect(selectedEdge?.durationMinutes).toBe(28)
  })

  it("keeps hover separate from the persistent node selection", () => {
    useWorkspaceStore.getState().setDraftRoute(silkRoadRoute)
    useWorkspaceStore.getState().enterCityView("node-xian")
    render(<RoutePreview />)

    const node = screen.getByRole("button", { name: "选择节点 西安城墙" })
    fireEvent.mouseEnter(node)
    expect(useWorkspaceStore.getState().hoveredRouteNodeId).toBe(
      "subnode-xian-city-wall"
    )
    expect(useWorkspaceStore.getState().selectedLocationPoint).toBeNull()

    fireEvent.mouseLeave(node)
    expect(useWorkspaceStore.getState().hoveredRouteNodeId).toBeNull()
  })
})
