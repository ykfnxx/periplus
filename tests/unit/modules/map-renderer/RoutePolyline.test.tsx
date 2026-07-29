import { render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import RoutePolyline from "@/modules/map-renderer/ui/RoutePolyline"
import type { DraftRoute } from "@/types/route"

const { storeState, polylineOptions, markerOptions } = vi.hoisted(() => ({
  storeState: {
    map: null as AMap.Map | null,
    draftRoute: null as DraftRoute | null,
    viewLevel: "overview" as const,
    activeRouteNodeId: null as string | null,
    selectedEdgeId: "edge-1" as string | null,
    setSelectedEdgeId: vi.fn(),
  },
  polylineOptions: [] as Array<Record<string, unknown>>,
  markerOptions: [] as Array<Record<string, unknown>>,
}))

vi.mock("@/modules/workspace/state/workspace-store", () => {
  const useWorkspaceStore = (selector: (state: typeof storeState) => unknown) =>
    selector(storeState)
  useWorkspaceStore.getState = () => storeState
  return { useWorkspaceStore }
})

function createRoute(): DraftRoute {
  return {
    id: "route-1",
    name: "Navigation route",
    nodes: [
      {
        id: "node-1",
        name: "Start",
        lat: 30,
        lng: 120,
        order: 0,
        category: "CITY",
      },
      {
        id: "node-2",
        name: "End",
        lat: 30.2,
        lng: 120.2,
        order: 1,
        category: "CITY",
      },
    ],
    edges: [
      {
        id: "edge-1",
        fromNodeId: "node-1",
        toNodeId: "node-2",
        status: "PLANNED",
        transportMode: "CAR",
        planningStatus: "READY",
        selectedPlanId: "plan-selected",
        plans: [
          {
            id: "plan-selected",
            provider: "amap",
            rank: 0,
            label: "推荐方案",
            strategy: "fastest",
            durationSeconds: 1800,
            distanceMeters: 12000,
            trafficBasis: "REALTIME",
            calculatedAt: "2026-07-11T10:00:00.000Z",
            requestFingerprint: "fingerprint-selected",
            segments: [
              {
                id: "segment-drive",
                mode: "DRIVE",
                order: 0,
                durationSeconds: 1500,
                distanceMeters: 11000,
                geometryKind: "ROAD_NETWORK",
                coordinateSystem: "GCJ02",
                positions: [
                  [120, 30],
                  [120.1, 30.1],
                ],
                trafficSections: [
                  {
                    status: "SLOW",
                    positions: [
                      [120.04, 30.04],
                      [120.08, 30.08],
                    ],
                  },
                ],
              },
              {
                id: "segment-walk",
                mode: "WALK",
                order: 1,
                durationSeconds: 300,
                distanceMeters: 1000,
                geometryKind: "SCHEMATIC",
                coordinateSystem: "GCJ02",
                positions: [
                  [120.1, 30.1],
                  [120.2, 30.2],
                ],
              },
            ],
          },
          {
            id: "plan-alternative",
            provider: "amap",
            rank: 1,
            label: "备选方案",
            strategy: "alternative",
            durationSeconds: 2100,
            distanceMeters: 14000,
            trafficBasis: "REALTIME",
            calculatedAt: "2026-07-11T10:00:00.000Z",
            requestFingerprint: "fingerprint-alternative",
            segments: [
              {
                id: "segment-alternative",
                mode: "DRIVE",
                order: 0,
                durationSeconds: 2100,
                distanceMeters: 14000,
                geometryKind: "ROAD_NETWORK",
                coordinateSystem: "GCJ02",
                positions: [
                  [120, 30],
                  [120.2, 30.2],
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

describe("RoutePolyline", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    polylineOptions.length = 0
    markerOptions.length = 0
    ;(globalThis as unknown as Record<string, unknown>).AMap = {
      LngLat: function (lng: number, lat: number) {
        return { lng, lat }
      },
      Pixel: function (x: number, y: number) {
        return { x, y }
      },
      Polyline: function (options: Record<string, unknown>) {
        polylineOptions.push(options)
        return { options, on: vi.fn() }
      },
      Marker: function (options: Record<string, unknown>) {
        markerOptions.push(options)
        return { options }
      },
    }
    storeState.map = {
      add: vi.fn(),
      remove: vi.fn(),
      setFitView: vi.fn(),
      getZoom: vi.fn(() => 10),
      setZoom: vi.fn(),
      setZoomAndCenter: vi.fn(),
    } as unknown as AMap.Map
    storeState.draftRoute = createRoute()
    storeState.selectedEdgeId = "edge-1"
  })

  it("draws alternatives and the selected route with navigation layers", async () => {
    render(<RoutePolyline />)

    await waitFor(() => expect(polylineOptions).toHaveLength(6))

    expect(polylineOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          strokeColor: "#8fa1a8",
          strokeWeight: 4,
          zIndex: 55,
        }),
        expect.objectContaining({
          strokeColor: "#fffaf3",
          strokeWeight: 14,
        }),
        expect.objectContaining({ showDir: true, strokeWeight: 9 }),
        expect.objectContaining({
          strokeStyle: "dashed",
          strokeDasharray: [10, 8],
          showDir: false,
        }),
      ])
    )
    expect(markerOptions).toHaveLength(1)
    expect(storeState.map?.add).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ options: markerOptions[0] }),
      ])
    )
    expect(storeState.map?.setFitView).not.toHaveBeenCalled()
    expect(storeState.map?.setZoomAndCenter).not.toHaveBeenCalled()
  })

  it("keeps alternative geometry hidden until the edge is selected", async () => {
    storeState.selectedEdgeId = null
    render(<RoutePolyline />)

    await waitFor(() => expect(polylineOptions).toHaveLength(5))
    expect(polylineOptions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          strokeColor: "#8fa1a8",
          zIndex: 55,
        }),
      ])
    )
  })
})
