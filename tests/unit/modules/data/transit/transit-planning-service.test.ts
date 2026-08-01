import { describe, expect, it, vi } from "vitest"
import {
  TransitPlanningService,
  type TransitPlanProvider,
  type TransitPlanUsageContext,
} from "@/modules/data/transit/transit-planning-service"
import { TransitProviderError } from "@/modules/data/transit/providers/amap-transit-provider"
import {
  transitPlanFingerprint,
  type TransitPlanBundle,
  type TransitPlanRequest,
} from "@/lib/journeys/planning"

const request: TransitPlanRequest = {
  transitEventId: "transit-a",
  origin: { name: "A", lat: 30, lng: 120 },
  destination: { name: "B", lat: 31, lng: 121 },
  mode: "DRIVE",
  transportMode: "CAR",
  preference: "RECOMMENDED",
  alternatives: 3,
}

function providerBundle(input: TransitPlanRequest): TransitPlanBundle {
  const fingerprint = transitPlanFingerprint(input)
  return {
    transitEventId: input.transitEventId,
    requestFingerprint: fingerprint,
    plans: [
      {
        id: `provider-${fingerprint}-0`,
        provider: "mock",
        rank: 0,
        label: "推荐",
        strategy: "recommended",
        distanceMeters: 1_000,
        durationSeconds: 600,
        fareAmount: 12,
        trafficBasis: "TYPICAL",
        calculatedAt: "2026-08-01T00:00:00.000Z",
        requestFingerprint: fingerprint,
        segments: [
          {
            id: `provider-segment-${fingerprint}-0`,
            order: 0,
            mode: "DRIVE",
            coordinateSystem: "GCJ02",
            geometryKind: "ROAD_NETWORK",
            positions: [
              [120, 30],
              [121, 31],
            ],
          },
        ],
      },
    ],
  }
}

function createService(provider: TransitPlanProvider) {
  return new TransitPlanningService({
    provider,
    sleep: vi.fn(async () => undefined),
    logUsage: vi.fn(async () => undefined),
  })
}

describe("TransitPlanningService", () => {
  it("deduplicates simultaneous identical requests but scopes every id to its event", async () => {
    const provider = { plan: vi.fn(async (input) => providerBundle(input)) }
    const service = createService(provider)

    const [first, second] = await Promise.all([
      service.plan(request),
      service.plan({ ...request, transitEventId: "transit-b" }),
    ])

    expect(provider.plan).toHaveBeenCalledTimes(1)
    expect(first.transitEventId).toBe("transit-a")
    expect(second.transitEventId).toBe("transit-b")
    expect(first.plans[0]!.id).toMatch(/^transit-a-/)
    expect(second.plans[0]!.id).toMatch(/^transit-b-/)
    expect(first.plans[0]!.segments[0]!.id).toMatch(/^transit-a-/)
    expect(second.plans[0]!.segments[0]!.id).toMatch(/^transit-b-/)
    expect(first.plans[0]!.id).not.toBe(second.plans[0]!.id)
    expect(first.plans[0]!.segments[0]!.id).not.toBe(
      second.plans[0]!.segments[0]!.id
    )
  })

  it("keeps ids distinct for sequential identical requests in one journey", async () => {
    const provider = { plan: vi.fn(async (input) => providerBundle(input)) }
    const service = createService(provider)

    const first = await service.plan(request)
    const second = await service.plan({
      ...request,
      transitEventId: "transit-b",
    })

    expect(provider.plan).toHaveBeenCalledTimes(2)
    expect(first.plans[0]!.id).not.toBe(second.plans[0]!.id)
    expect(first.plans[0]!.segments[0]!.id).not.toBe(
      second.plans[0]!.segments[0]!.id
    )
  })

  it("retries transient failures before returning the event-scoped bundle", async () => {
    const provider = {
      plan: vi
        .fn()
        .mockRejectedValueOnce(new TransitProviderError("TIMEOUT", "timeout"))
        .mockImplementation(async (input) => providerBundle(input)),
    }
    const service = createService(provider)

    const result = await service.plan(request)

    expect(provider.plan).toHaveBeenCalledTimes(2)
    expect(result.plans[0]!.id).toMatch(/^transit-a-/)
  })

  it("deduplicates only within the same provider-usage attribution", async () => {
    const provider = { plan: vi.fn(async (input) => providerBundle(input)) }
    const logUsage = vi.fn(
      async (
        _status: string,
        _code?: string,
        _context?: TransitPlanUsageContext
      ) => undefined
    )
    const service = new TransitPlanningService({
      provider,
      sleep: vi.fn(async () => undefined),
      logUsage,
    })
    const contexts = [
      {
        userId: "user",
        workspaceId: "workspace-a",
        agentRunId: "run-a",
        requestId: "request-a",
      },
      {
        userId: "user",
        workspaceId: "workspace-b",
        agentRunId: "run-a",
        requestId: "request-a",
      },
      {
        userId: "user",
        workspaceId: "workspace-a",
        agentRunId: "run-b",
        requestId: "request-b",
      },
    ]
    await Promise.all([
      service.plan(request, contexts[0]),
      service.plan({ ...request, transitEventId: "transit-b" }, contexts[0]),
      service.plan({ ...request, transitEventId: "transit-c" }, contexts[1]),
      service.plan({ ...request, transitEventId: "transit-d" }, contexts[2]),
    ])
    expect(provider.plan).toHaveBeenCalledTimes(3)
    expect(logUsage).toHaveBeenCalledTimes(3)
    expect(logUsage.mock.calls.map((call) => call[2])).toEqual(contexts)
  })

  it("records failures independently for distinct logical attributions", async () => {
    const provider = {
      plan: vi.fn(async () => {
        throw new TransitProviderError("AUTH_OR_QUOTA", "denied")
      }),
    }
    const logUsage = vi.fn(
      async (
        _status: string,
        _code?: string,
        _context?: TransitPlanUsageContext
      ) => undefined
    )
    const service = new TransitPlanningService({
      provider,
      sleep: vi.fn(async () => undefined),
      logUsage,
    })
    const contexts = [
      { userId: "user", workspaceId: "workspace-a", requestId: "a" },
      { userId: "user", workspaceId: "workspace-b", requestId: "b" },
    ]
    const results = await Promise.allSettled(
      contexts.map((usageContext) => service.plan(request, usageContext))
    )
    expect(results.every((result) => result.status === "rejected")).toBe(true)
    expect(provider.plan).toHaveBeenCalledTimes(2)
    expect(logUsage).toHaveBeenCalledTimes(2)
    expect(logUsage.mock.calls.map((call) => call[2])).toEqual(contexts)
  })
})
