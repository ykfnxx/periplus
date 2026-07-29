import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import RoutePlanSync from "@/modules/workspace/ui/RoutePlanSync"
import {
  buildRoutePlanRequest,
  routePlanFingerprint,
  type RoutePlanBundle,
  type RoutePlanFailure,
  type RoutePlanRequest,
} from "@/lib/routes/planning"
import type { DraftRoute } from "@/types/route"

const { resolveRoutePlans, storeState } = vi.hoisted(() => ({
  resolveRoutePlans: vi.fn<
    (requests: RoutePlanRequest[]) => Promise<{
      bundles: RoutePlanBundle[]
      failures: RoutePlanFailure[]
    }>
  >(async () => ({ bundles: [], failures: [] })),
  storeState: {
    draftRoute: null as DraftRoute | null,
    markRoutePlansPlanning: vi.fn(),
    applyRoutePlanBundles: vi.fn(),
    markRoutePlanFailures: vi.fn(),
  },
}))

vi.mock("@/modules/data/routes/client", () => ({ resolveRoutePlans }))
vi.mock("@/modules/workspace/state/workspace-store", () => ({
  useWorkspaceStore: (selector: (state: typeof storeState) => unknown) =>
    selector(storeState),
}))

function routeWithoutSessionPlans(): DraftRoute {
  const route: DraftRoute = {
    id: "route-1",
    name: "Session route",
    nodes: [
      {
        id: "node-1",
        name: "丽江",
        lat: 26.8721,
        lng: 100.2299,
        order: 0,
        category: "CITY",
      },
      {
        id: "node-2",
        name: "香格里拉",
        lat: 27.8297,
        lng: 99.7008,
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
      },
    ],
    subPlans: [],
  }
  const request = buildRoutePlanRequest(
    route.edges[0],
    route.nodes[0],
    route.nodes[1]
  )!
  route.edges[0].planningFingerprint = routePlanFingerprint(request)
  return route
}

describe("RoutePlanSync", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    resolveRoutePlans.mockReset()
    resolveRoutePlans.mockResolvedValue({ bundles: [], failures: [] })
    storeState.draftRoute = routeWithoutSessionPlans()
  })

  afterEach(() => vi.useRealTimers())

  it("replans READY edges when session geometry is missing", async () => {
    render(<RoutePlanSync />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })

    expect(resolveRoutePlans).toHaveBeenCalledWith([
      expect.objectContaining({ edgeId: "edge-1", mode: "DRIVE" }),
    ])
  })

  it("replans READY edges that only contain mock geometry", async () => {
    const route = routeWithoutSessionPlans()
    route.edges[0].plans = [
      {
        id: "mock-plan",
        provider: "mock",
        rank: 0,
        label: "旧方案",
        strategy: "mock",
        distanceMeters: 1000,
        durationSeconds: 600,
        trafficBasis: "TYPICAL",
        calculatedAt: "2026-07-12T00:00:00.000Z",
        requestFingerprint: route.edges[0].planningFingerprint!,
        segments: [
          {
            id: "mock-segment",
            order: 0,
            mode: "DRIVE",
            coordinateSystem: "GCJ02",
            geometryKind: "ROAD_NETWORK",
            positions: [
              [100.2299, 26.8721],
              [99.7008, 27.8297],
            ],
          },
        ],
      },
    ]
    storeState.draftRoute = route

    render(<RoutePlanSync />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })

    expect(resolveRoutePlans).toHaveBeenCalledWith([
      expect.objectContaining({ edgeId: "edge-1", mode: "DRIVE" }),
    ])
  })

  it("does not lose planning when a fresh snapshot cancels the debounce", async () => {
    const view = render(<RoutePlanSync />)
    storeState.draftRoute = {
      ...storeState.draftRoute!,
      name: "Session route refreshed",
    }
    view.rerender(<RoutePlanSync />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })

    expect(resolveRoutePlans).toHaveBeenCalledTimes(1)
    expect(resolveRoutePlans).toHaveBeenCalledWith([
      expect.objectContaining({ edgeId: "edge-1", mode: "DRIVE" }),
    ])
  })

  it("retries a transient provider failure after a client backoff", async () => {
    resolveRoutePlans.mockResolvedValueOnce({
      bundles: [],
      failures: [
        {
          edgeId: "edge-1",
          code: "RATE_LIMIT",
          message: "高德路线服务请求过快，请稍后重试",
        },
      ],
    })
    render(<RoutePlanSync />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })
    expect(resolveRoutePlans).toHaveBeenCalledTimes(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
    })

    expect(resolveRoutePlans).toHaveBeenCalledTimes(2)
  })

  it("does not automatically retry a permanent no-route result", async () => {
    resolveRoutePlans.mockResolvedValueOnce({
      bundles: [],
      failures: [
        {
          edgeId: "edge-1",
          code: "NO_ROUTE",
          message: "未找到可用路线",
        },
      ],
    })
    render(<RoutePlanSync />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })

    expect(resolveRoutePlans).toHaveBeenCalledTimes(1)
  })
})
