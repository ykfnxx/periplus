import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createSilkRoadJourney } from "@/lib/mock-journeys"
import RoutePolyline from "@/modules/map-renderer/ui/RoutePolyline"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { workspaceDocumentForStory } from "@/tests/storybook/workspace-story"

interface PolylineConfig {
  path: Array<{ lng: number; lat: number }>
  strokeColor: string
}

const polylineConfigs: PolylineConfig[] = []

class MockLngLat {
  constructor(
    public lng: number,
    public lat: number
  ) {}
}

class MockPolyline {
  constructor(config: PolylineConfig) {
    polylineConfigs.push(config)
  }

  on() {}
}

class MockMarker {
  constructor() {}
}

function routeDocument(selectedPlanId: "plan-current" | "plan-next") {
  const document = workspaceDocumentForStory(
    createSilkRoadJourney({ id: "journey", ownerId: "owner" })
  )
  document.session.headWorkspaceRevision =
    selectedPlanId === "plan-current" ? 1 : 2
  const transit = document.session.headGraph.events.find(
    (event) => event.id === "transit-xian-lanzhou"
  )
  if (transit?.type !== "TRANSIT") throw new Error("transit fixture missing")
  transit.detail.activePlanningRunId = "run-ready"
  transit.detail.selectedPlanId = selectedPlanId
  transit.detail.routeState = "READY"
  document.session.headGraph.transitPlanningRuns = [
    ...document.session.headGraph.transitPlanningRuns.filter(
      (run) => run.transitEventId !== transit.id
    ),
    {
      id: "run-ready",
      transitEventId: transit.id,
      requestFingerprint: "fingerprint",
      provider: "mock",
      status: "READY",
      calculatedAt: "2026-08-01T00:00:00.000Z",
      plans: [
        {
          id: "plan-current",
          planningRunId: "run-ready",
          transitEventId: transit.id,
          provider: "mock",
          rank: 0,
          label: "当前",
          strategy: "recommended",
          distanceMeters: 1_000,
          durationSeconds: 600,
          trafficBasis: "TYPICAL",
          calculatedAt: "2026-08-01T00:00:00.000Z",
          segments: [
            {
              id: "segment-current",
              order: 0,
              mode: "DRIVE",
              coordinateSystem: "GCJ02",
              geometryKind: "ROAD_NETWORK",
              positions: [
                [108.9, 34.3],
                [109.1, 34.5],
              ],
            },
          ],
        },
        {
          id: "plan-next",
          planningRunId: "run-ready",
          transitEventId: transit.id,
          provider: "mock",
          rank: 1,
          label: "备选",
          strategy: "fastest",
          distanceMeters: 900,
          durationSeconds: 500,
          trafficBasis: "TYPICAL",
          calculatedAt: "2026-08-01T00:00:00.000Z",
          segments: [
            {
              id: "segment-next",
              order: 0,
              mode: "DRIVE",
              coordinateSystem: "GCJ02",
              geometryKind: "ROAD_NETWORK",
              positions: [
                [118.8, 31.2],
                [119.2, 31.6],
              ],
            },
          ],
        },
      ],
    },
  ]
  return document
}

describe("authoritative TransitPlan map synchronization", () => {
  beforeEach(() => {
    polylineConfigs.length = 0
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
    vi.stubGlobal("AMap", {
      LngLat: MockLngLat,
      Polyline: MockPolyline,
      Marker: MockMarker,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("repaints geometry only after the authoritative document selects a plan", () => {
    const map = { add: vi.fn(), remove: vi.fn() }
    act(() => {
      useWorkspaceStore.getState().setMap(map as unknown as AMap.Map)
      useWorkspaceStore
        .getState()
        .applyWorkspaceDocument(routeDocument("plan-current"))
    })
    render(<RoutePolyline />)

    expect(
      polylineConfigs.some(
        (config) =>
          config.path[0]?.lng === 108.9 && config.path[0]?.lat === 34.3
      )
    ).toBe(true)
    const beforeAuthoritativeUpdate = polylineConfigs.length

    act(() => {
      useWorkspaceStore
        .getState()
        .applyWorkspaceDocument(routeDocument("plan-next"))
    })

    expect(map.remove).toHaveBeenCalled()
    expect(
      polylineConfigs
        .slice(beforeAuthoritativeUpdate)
        .some(
          (config) =>
            config.path[0]?.lng === 118.8 && config.path[0]?.lat === 31.2
        )
    ).toBe(true)
  })
})
