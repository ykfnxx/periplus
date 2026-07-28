import { act, render, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import RouteMarkers from "@/modules/map-renderer/ui/RouteMarkers"
import type { DraftRoute } from "@/types/route"

const { storeState } = vi.hoisted(() => ({
  storeState: {
    map: null as AMap.Map | null,
    draftRoute: null as DraftRoute | null,
    viewLevel: "overview" as const,
    activeRouteNodeId: null as string | null,
    photoShares: [],
    selectedLocationPoint: null,
    setSelectedLocationPoint: vi.fn(),
    setSelectedPhotoShare: vi.fn(),
    enterCityView: vi.fn(),
  },
}))

vi.mock("@/modules/workspace/state/workspace-store", () => ({
  useWorkspaceStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

function createRoute(): DraftRoute {
  return {
    id: "route-1",
    name: "Zoom route",
    nodes: [
      {
        id: "node-1",
        name: "Node 1",
        lat: 30,
        lng: 100,
        order: 0,
        category: "CITY",
      },
      {
        id: "node-2",
        name: "Node 2",
        lat: 30.01,
        lng: 100.01,
        order: 1,
        category: "CITY",
      },
    ],
    edges: [],
    subPlans: [],
  }
}

describe("RouteMarkers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as unknown as Record<string, unknown>).AMap = {
      LngLat: function (_lng: number, _lat: number) {
        return { lng: _lng, lat: _lat }
      },
      Pixel: function (_x: number, _y: number) {
        return { x: _x, y: _y }
      },
      Marker: function (options: unknown) {
        return { options, on: vi.fn() }
      },
    }
  })

  it("re-renders hidden route nodes after zoom changes cluster distance", async () => {
    let zoomed = false
    const handlers = new Map<string, () => void>()
    const map = {
      add: vi.fn(),
      remove: vi.fn(),
      on: vi.fn((event: string, handler: () => void) => {
        handlers.set(event, handler)
      }),
      off: vi.fn((event: string) => {
        handlers.delete(event)
      }),
      lngLatToContainer: vi.fn((lngLat: { lng: number }) => ({
        getX: () => (zoomed ? (lngLat.lng === 100 ? 0 : 80) : 0),
        getY: () => 0,
      })),
    } as unknown as AMap.Map

    storeState.map = map
    storeState.draftRoute = createRoute()

    render(<RouteMarkers />)

    await waitFor(() => {
      expect(
        (map.add as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]
      ).toHaveLength(0)
    })

    zoomed = true
    await act(async () => {
      handlers.get("zoomchange")?.()
      await new Promise((resolve) => window.requestAnimationFrame(resolve))
    })

    await waitFor(() => {
      const lastMarkers = (
        map.add as unknown as ReturnType<typeof vi.fn>
      ).mock.calls.at(-1)?.[0]
      expect(lastMarkers).toHaveLength(2)
    })
  })
})
