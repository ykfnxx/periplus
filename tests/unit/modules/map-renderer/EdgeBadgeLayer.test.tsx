import { render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import EdgeBadgeLayer from "@/modules/map-renderer/ui/EdgeBadgeLayer"
import type { DraftRoute } from "@/types/route"

const { storeState, markerOptions } = vi.hoisted(() => ({
  storeState: {
    map: null as AMap.Map | null,
    draftRoute: null as DraftRoute | null,
    viewLevel: "overview" as const,
    activeRouteNodeId: null as string | null,
    selectedEdgeId: null as string | null,
  },
  markerOptions: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/modules/workspace/state/workspace-store", () => ({
  useWorkspaceStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

function createRoute(planningStatus: "READY" | "FAILED" = "READY"): DraftRoute {
  return {
    id: "route",
    name: "真实路线",
    nodes: [
      {
        id: "from",
        name: "起点",
        lat: 34,
        lng: 108,
        order: 0,
        category: "CITY",
      },
      {
        id: "to",
        name: "终点",
        lat: 35,
        lng: 106,
        order: 1,
        category: "CITY",
      },
    ],
    edges: [
      {
        id: "edge",
        fromNodeId: "from",
        toNodeId: "to",
        status: "PLANNED",
        planningStatus,
        selectedPlanId: "plan",
        plans: [
          {
            id: "plan",
            provider: "amap",
            rank: 0,
            label: "推荐方案",
            strategy: "recommended",
            distanceMeters: 220_000,
            durationSeconds: 4_320,
            trafficBasis: "TYPICAL",
            calculatedAt: "2026-07-29T00:00:00.000Z",
            requestFingerprint: "fingerprint",
            segments: [
              {
                id: "drive",
                order: 0,
                mode: "DRIVE",
                coordinateSystem: "GCJ02",
                geometryKind: "ROAD_NETWORK",
                positions: [
                  [108, 34],
                  [107, 34.5],
                  [106, 35],
                ],
              },
            ],
          },
        ],
      },
    ],
    subPlans: [],
  }
}

describe("EdgeBadgeLayer", () => {
  beforeEach(() => {
    markerOptions.length = 0
    ;(globalThis as unknown as Record<string, unknown>).AMap = {
      LngLat: function (lng: number, lat: number) {
        return { lng, lat }
      },
      Pixel: function (x: number, y: number) {
        return { x, y }
      },
      Marker: function (options: Record<string, unknown>) {
        markerOptions.push(options)
        return { options }
      },
    }
    storeState.map = {
      add: vi.fn(),
      remove: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      lngLatToContainer: vi.fn(() => ({
        getX: () => 320,
        getY: () => 240,
      })),
    } as unknown as AMap.Map
    storeState.draftRoute = createRoute()
    storeState.selectedEdgeId = null
  })

  it("renders a route-plan badge and forwards its selection intent", async () => {
    const onIntent = vi.fn()
    render(<EdgeBadgeLayer onIntent={onIntent} />)

    await waitFor(() => expect(markerOptions).toHaveLength(1))
    const content = markerOptions[0].content as HTMLButtonElement
    expect(content.textContent).toBe("驾车 1 小时 12 分")

    content.click()
    expect(onIntent).toHaveBeenCalledWith({
      type: "map.edge-selected",
      edgeId: "edge",
    })
  })

  it("does not show an exact badge for a failed route", async () => {
    storeState.draftRoute = createRoute("FAILED")
    render(<EdgeBadgeLayer />)

    await waitFor(() => {
      expect(storeState.map?.add).not.toHaveBeenCalled()
    })
    expect(markerOptions).toHaveLength(0)
  })
})
