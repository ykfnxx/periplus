import { describe, expect, it, vi } from "vitest"
import { AMapRouteProvider } from "@/modules/data/routes/providers/amap-route-provider"
import type { RoutePlanRequest } from "@/lib/routes/planning"

const baseRequest: RoutePlanRequest = {
  edgeId: "edge-1",
  origin: {
    name: "西湖",
    lat: 30.246,
    lng: 120.146,
    coordinateSystem: "GCJ02",
  },
  destination: {
    name: "灵隐寺",
    lat: 30.24,
    lng: 120.102,
    coordinateSystem: "GCJ02",
  },
  mode: "DRIVE",
  preference: "RECOMMENDED",
  alternatives: 3,
}

function response(body: unknown) {
  return Promise.resolve({ ok: true, json: async () => body } as Response)
}

describe("AMapRouteProvider", () => {
  it("normalizes driving geometry, traffic and summary", async () => {
    const fetcher = vi.fn(() =>
      response({
        status: "1",
        route: {
          paths: [
            {
              distance: "12000",
              cost: { duration: "1800", tolls: "15" },
              steps: [
                {
                  polyline: "120.146,30.246;120.120,30.243;120.102,30.240",
                  tmcs: [
                    {
                      tmc_status: "畅通",
                      tmc_polyline: "120.146,30.246;120.120,30.243",
                    },
                  ],
                },
              ],
            },
          ],
        },
      })
    )
    const provider = new AMapRouteProvider({
      key: "test-key",
      fetcher: fetcher as typeof fetch,
      now: () => new Date("2026-07-11T08:00:00+08:00"),
    })

    const bundle = await provider.plan(baseRequest)

    expect(bundle.plans[0]).toMatchObject({
      distanceMeters: 12000,
      durationSeconds: 1800,
      fareAmount: 15,
      trafficBasis: "REALTIME",
      segments: [
        {
          mode: "DRIVE",
          geometryKind: "ROAD_NETWORK",
          trafficSections: [{ status: "FREE_FLOW" }],
        },
      ],
    })
  })

  it("expands a transit response into walking, subway and schematic rail", async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() =>
        response({
          status: "1",
          regeocode: { addressComponent: { citycode: "0571" } },
        })
      )
      .mockImplementationOnce(() =>
        response({
          status: "1",
          regeocode: { addressComponent: { citycode: "021" } },
        })
      )
      .mockImplementationOnce(() =>
        response({
          status: "1",
          route: {
            transits: [
              {
                distance: "190000",
                cost: { duration: "9000", transit_fee: "85" },
                segments: [
                  {
                    walking: {
                      distance: "500",
                      steps: [{ polyline: "120.1,30.2;120.11,30.21" }],
                    },
                    bus: {
                      buslines: [
                        {
                          name: "地铁1号线",
                          distance: "8000",
                          duration: "1200",
                          polyline: "120.11,30.21;120.2,30.3",
                          departure_stop: { name: "龙翔桥" },
                          arrival_stop: { name: "杭州东站" },
                        },
                      ],
                    },
                    railway: {
                      trip: "G1234",
                      distance: "170000",
                      duration: "4200",
                      departure_stop: {
                        name: "杭州东",
                        location: "120.2,30.3",
                      },
                      arrival_stop: {
                        name: "上海虹桥",
                        location: "121.3,31.2",
                      },
                    },
                  },
                ],
              },
            ],
          },
        })
      )
    const provider = new AMapRouteProvider({
      key: "test-key",
      fetcher: fetcher as typeof fetch,
      now: () => new Date("2026-07-11T08:00:00+08:00"),
    })

    const bundle = await provider.plan({
      ...baseRequest,
      mode: "TRANSIT",
      departAt: "2026-07-12T09:30:00+08:00",
    })

    expect(bundle.plans[0]).toMatchObject({
      fareAmount: 85,
      trafficBasis: "SCHEDULED",
      segments: [
        { mode: "WALK", geometryKind: "ROAD_NETWORK" },
        { mode: "SUBWAY", lineName: "地铁1号线" },
        { mode: "RAIL", lineName: "G1234", geometryKind: "SCHEMATIC" },
      ],
    })
    const transitUrl = String(fetcher.mock.calls[2][0])
    expect(transitUrl).toContain("city1=0571")
    expect(transitUrl).toContain("city2=021")
    expect(transitUrl).toContain("date=2026-07-12")
  })

  it("warns when future driving time cannot be honored", async () => {
    const provider = new AMapRouteProvider({
      key: "test-key",
      fetcher: vi.fn(() =>
        response({
          status: "1",
          route: {
            paths: [
              {
                distance: "1000",
                cost: { duration: "600" },
                steps: [{ polyline: "120.1,30.2;120.2,30.3" }],
              },
            ],
          },
        })
      ) as typeof fetch,
      now: () => new Date("2026-07-11T08:00:00+08:00"),
    })
    const bundle = await provider.plan({
      ...baseRequest,
      departAt: "2026-07-12T09:00:00+08:00",
    })
    expect(bundle.warning).toContain("不支持未来出发时刻")
    expect(bundle.plans[0].trafficBasis).toBe("TYPICAL")
  })

  it("reports an actionable error when the server IP is not allowed", async () => {
    const provider = new AMapRouteProvider({
      key: "test-key",
      fetcher: vi.fn(() =>
        response({
          status: "0",
          info: "INVALID_USER_IP",
          infocode: "10005",
        })
      ) as typeof fetch,
    })

    await expect(provider.plan(baseRequest)).rejects.toEqual(
      expect.objectContaining({
        code: "AUTH_OR_QUOTA",
        message: expect.stringContaining("IP 白名单"),
      })
    )
  })
})
