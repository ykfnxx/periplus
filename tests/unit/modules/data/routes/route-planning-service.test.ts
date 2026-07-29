import { describe, expect, it, vi } from "vitest"
import { RoutePlanningService } from "@/modules/data/routes/route-planning-service"
import { RouteProviderError } from "@/modules/data/routes/providers/amap-route-provider"
import type { RoutePlanBundle, RoutePlanRequest } from "@/lib/routes/planning"

const request: RoutePlanRequest = {
  edgeId: "edge-1",
  origin: { name: "A", lat: 30, lng: 120 },
  destination: { name: "B", lat: 31, lng: 121 },
  mode: "DRIVE",
  preference: "RECOMMENDED",
  alternatives: 3,
}
const bundle: RoutePlanBundle = {
  edgeId: "edge-1",
  requestFingerprint: "fingerprint",
  plans: [],
}

describe("RoutePlanningService", () => {
  it("deduplicates simultaneous requests with different edge ids", async () => {
    const provider = { plan: vi.fn(async () => bundle) }
    const service = new RoutePlanningService({
      provider,
      logUsage: vi.fn(),
    })
    const [first, second] = await Promise.all([
      service.plan(request),
      service.plan({ ...request, edgeId: "edge-2" }),
    ])
    expect(provider.plan).toHaveBeenCalledTimes(1)
    expect(first.edgeId).toBe("edge-1")
    expect(second.edgeId).toBe("edge-2")
  })

  it("retries timeouts and then succeeds", async () => {
    const provider = {
      plan: vi
        .fn()
        .mockRejectedValueOnce(new RouteProviderError("TIMEOUT", "timeout"))
        .mockResolvedValueOnce(bundle),
    }
    const sleep = vi.fn(async () => undefined)
    const service = new RoutePlanningService({
      provider,
      sleep,
      logUsage: vi.fn(),
    })
    await expect(service.plan(request)).resolves.toEqual(bundle)
    expect(provider.plan).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it("backs off for one second before retrying a QPS failure", async () => {
    const provider = {
      plan: vi
        .fn()
        .mockRejectedValueOnce(
          new RouteProviderError("RATE_LIMIT", "too many requests")
        )
        .mockResolvedValueOnce(bundle),
    }
    const sleep = vi.fn(async () => undefined)
    const service = new RoutePlanningService({
      provider,
      sleep,
      logUsage: vi.fn(),
    })

    await expect(service.plan(request)).resolves.toEqual(bundle)
    expect(provider.plan).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(1_000)
  })

  it("stops a batch after an auth or quota failure", async () => {
    const provider = {
      plan: vi.fn(async () => {
        throw new RouteProviderError("AUTH_OR_QUOTA", "invalid key")
      }),
    }
    const service = new RoutePlanningService({ provider, logUsage: vi.fn() })
    const result = await service.planMany([
      request,
      { ...request, edgeId: "edge-2" },
    ])
    expect(provider.plan).toHaveBeenCalledTimes(1)
    expect(result.failures).toEqual([
      { edgeId: "edge-1", code: "AUTH_OR_QUOTA", message: "invalid key" },
      { edgeId: "edge-2", code: "AUTH_OR_QUOTA", message: "invalid key" },
    ])
  })
})
