import { describe, expect, it } from "vitest"
import {
  applyRoutePlanBundle,
  buildRoutePlanRequest,
  requestModeForTransport,
  routePlanFingerprint,
  mergeWorkspaceRoutePlans,
} from "@/lib/routes/planning"
import type { PathEdge, PathNode, RoutePlan } from "@/types/route"

const from: PathNode = {
  id: "from",
  name: "西湖",
  lat: 30.246,
  lng: 120.146,
  order: 0,
  category: "SIGHT",
  coordinateSystem: "GCJ02",
  coordinateProvider: "amap",
  providerPlaceId: "poi-west-lake",
}
const to: PathNode = {
  ...from,
  id: "to",
  name: "灵隐寺",
  lat: 30.24,
  lng: 120.102,
  order: 1,
}
const edge: PathEdge = {
  id: "edge-1",
  fromNodeId: "from",
  toNodeId: "to",
  status: "PLANNED",
  transportMode: "BUS",
}

describe("route planning domain", () => {
  it("maps existing transport modes to provider request modes", () => {
    expect(requestModeForTransport("CAR")).toBe("DRIVE")
    expect(requestModeForTransport("WALK")).toBe("WALK")
    expect(requestModeForTransport("BUS")).toBe("TRANSIT")
    expect(requestModeForTransport("TRAIN")).toBe("TRANSIT")
    expect(requestModeForTransport("FLIGHT")).toBeNull()
  })

  it("builds a provider-neutral request with AMap POI ids", () => {
    expect(buildRoutePlanRequest(edge, from, to)).toMatchObject({
      edgeId: "edge-1",
      mode: "TRANSIT",
      transportMode: "BUS",
      preference: "RECOMMENDED",
      alternatives: 3,
      origin: { providerPlaceId: "poi-west-lake" },
    })
  })

  it("defaults legacy city edges without a mode to driving", () => {
    expect(
      buildRoutePlanRequest(
        {
          ...edge,
          status: "INCOMPLETE",
          transportMode: undefined,
        },
        from,
        to
      )
    ).toMatchObject({
      mode: "DRIVE",
      transportMode: "CAR",
    })
  })

  it("keeps flights out of road route planning", () => {
    expect(
      buildRoutePlanRequest(
        {
          ...edge,
          transportMode: "FLIGHT",
        },
        from,
        to
      )
    ).toBeNull()
  })

  it("fingerprints planning inputs instead of edge identity", () => {
    const request = buildRoutePlanRequest(edge, from, to)!
    expect(routePlanFingerprint(request)).toBe(
      routePlanFingerprint({ ...request, edgeId: "another-edge" })
    )
    expect(
      routePlanFingerprint({ ...request, preference: "FASTEST" })
    ).not.toBe(routePlanFingerprint(request))
    expect(
      routePlanFingerprint({ ...request, transportMode: "TRAIN" })
    ).not.toBe(routePlanFingerprint(request))
  })

  it("projects the selected plan summary onto an edge", () => {
    const plan: RoutePlan = {
      id: "plan-1",
      provider: "mock",
      rank: 0,
      label: "推荐",
      strategy: "recommended",
      distanceMeters: 12340,
      durationSeconds: 3660,
      fareAmount: 18,
      trafficBasis: "SCHEDULED",
      calculatedAt: "2026-07-11T00:00:00.000Z",
      requestFingerprint: "fingerprint",
      segments: [],
    }
    const result = applyRoutePlanBundle(edge, {
      edgeId: edge.id,
      requestFingerprint: "fingerprint",
      plans: [plan],
    })
    expect(result).toMatchObject({
      selectedPlanId: "plan-1",
      planningStatus: "READY",
      durationMinutes: 61,
      distanceKm: 12.3,
      costEstimate: 18,
    })
  })

  it("keeps session plans across matching backend draft snapshots", () => {
    const plan: RoutePlan = {
      id: "plan-1",
      provider: "mock",
      rank: 0,
      label: "推荐",
      strategy: "recommended",
      distanceMeters: 1000,
      durationSeconds: 600,
      trafficBasis: "TYPICAL",
      calculatedAt: "2026-07-11T00:00:00.000Z",
      requestFingerprint: routePlanFingerprint(
        buildRoutePlanRequest(edge, from, to)!
      ),
      segments: [],
    }
    const route = {
      id: "route-1",
      ownerId: "user-1",
      name: "路线",
      nodes: [from, to],
      edges: [
        {
          ...edge,
          plans: [plan],
          selectedPlanId: plan.id,
          planningFingerprint: plan.requestFingerprint,
          planningStatus: "READY" as const,
        },
      ],
      subPlans: [],
      createdAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z",
    }
    const merged = mergeWorkspaceRoutePlans(route, {
      ...route,
      edges: [edge],
      updatedAt: "2026-07-11T00:01:00.000Z",
    })
    expect(merged?.edges[0]).toMatchObject({
      planningStatus: "READY",
      selectedPlanId: "plan-1",
      plans: [{ id: "plan-1" }],
    })
  })
})
