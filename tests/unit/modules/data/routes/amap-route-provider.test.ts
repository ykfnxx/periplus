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
                      steps: [
                        {
                          polyline: {
                            polyline: "120.1,30.2;120.11,30.21",
                          },
                        },
                      ],
                    },
                    bus: {
                      buslines: [
                        {
                          name: "地铁1号线",
                          distance: "8000",
                          duration: "1200",
                          polyline: {
                            polyline: "120.11,30.21;120.2,30.3",
                          },
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

  it("uses railway alternatives to build a smooth route through known stations", async () => {
    const fetcher = vi
      .fn()
      .mockImplementationOnce(() =>
        response({
          status: "1",
          regeocode: { addressComponent: { citycode: "0871" } },
        })
      )
      .mockImplementationOnce(() =>
        response({
          status: "1",
          regeocode: { addressComponent: { citycode: "0872" } },
        })
      )
      .mockImplementationOnce(() =>
        response({
          status: "1",
          route: {
            transits: [
              {
                distance: "292742",
                duration: "10860",
                cost: "118",
                segments: [
                  {
                    railway: {
                      trip: "D8652",
                      distance: "288178",
                      time: "6900",
                      departure_stop: {
                        name: "昆明",
                        location: "102.722722 25.015486",
                      },
                      arrival_stop: {
                        name: "大理",
                        location: "100.268700 25.606500",
                      },
                      via_stops: [],
                    },
                  },
                ],
              },
              {
                distance: "310000",
                duration: "14400",
                cost: "72",
                segments: [
                  {
                    railway: {
                      trip: "7466",
                      departure_stop: {
                        name: "昆明",
                        location: "102.722722 25.015486",
                      },
                      via_stops: [
                        {
                          name: "禄丰南",
                          location: "102.063658,25.120056",
                        },
                      ],
                      arrival_stop: {
                        name: "广通北",
                        location: "101.747617 25.135714",
                      },
                    },
                  },
                  {
                    railway: {
                      trip: "D8661",
                      departure_stop: {
                        name: "广通北",
                        location: "101.747617 25.135714",
                      },
                      via_stops: [
                        {
                          name: "楚雄",
                          location: "101.544387,25.082103",
                        },
                      ],
                      arrival_stop: {
                        name: "大理",
                        location: "100.268700 25.606500",
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
      transportMode: "TRAIN",
      departAt: "2026-07-12T09:30:00+08:00",
    })

    const rail = bundle.plans[0].segments.find(
      (segment) => segment.mode === "RAIL"
    )
    expect(bundle.plans[0]).toMatchObject({
      label: "推荐火车",
      distanceMeters: 292742,
      durationSeconds: 10860,
      fareAmount: 118,
    })
    expect(rail).toMatchObject({
      lineName: "D8652",
      durationSeconds: 6900,
      geometryKind: "SCHEMATIC",
    })
    expect(rail?.positions.length).toBeGreaterThan(5)
    expect(rail?.positions).toContainEqual([102.063658, 25.120056])
    expect(rail?.positions).toContainEqual([101.747617, 25.135714])
    expect(rail?.positions).toContainEqual([101.544387, 25.082103])

    const transitUrl = String(fetcher.mock.calls[2][0])
    expect(transitUrl).toContain("/v3/direction/transit/integrated")
    expect(transitUrl).toContain("city=0871")
    expect(transitUrl).toContain("cityd=0872")
    expect(transitUrl).toContain("extensions=all")
    expect(transitUrl).toContain("time=09%3A30")
  })

  it("does not accept a bus-only plan for a requested train edge", async () => {
    const fetcher = vi.fn((_input: string | URL | Request) =>
      response({
        status: "1",
        route: {
          transits: [
            {
              distance: "187000",
              duration: "27540",
              segments: [
                {
                  bus: {
                    buslines: [
                      {
                        name: "大理客运站-丽江客运站",
                        polyline: "100.2,25.5;100.3,26.8",
                      },
                    ],
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
      now: () => new Date("2026-07-11T21:00:00+08:00"),
    })

    await expect(
      provider.plan({
        ...baseRequest,
        origin: { ...baseRequest.origin, cityCode: "0872" },
        destination: { ...baseRequest.destination, cityCode: "0888" },
        mode: "TRANSIT",
        transportMode: "TRAIN",
      })
    ).rejects.toEqual(
      expect.objectContaining({
        code: "NO_ROUTE",
        message: "未找到火车方案",
      })
    )

    const transitUrl = String(fetcher.mock.calls[0][0])
    expect(transitUrl).not.toContain("date=")
    expect(transitUrl).not.toContain("time=")
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

  it("reports account QPS errors as retryable rate limits", async () => {
    const provider = new AMapRouteProvider({
      key: "test-key",
      fetcher: vi.fn(() =>
        response({
          status: "0",
          info: "CUQPS_HAS_EXCEEDED_THE_LIMIT",
          infocode: "10021",
        })
      ) as typeof fetch,
    })

    await expect(provider.plan(baseRequest)).rejects.toEqual(
      expect.objectContaining({
        code: "RATE_LIMIT",
        message: "高德路线服务请求过快，请稍后重试",
      })
    )
  })

  it("spaces consecutive Web service calls", async () => {
    const fetcher = vi.fn(() =>
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
    )
    const sleep = vi.fn(async () => undefined)
    const provider = new AMapRouteProvider({
      key: "test-key",
      fetcher: fetcher as typeof fetch,
      requestIntervalMs: 250,
      sleep,
    })

    await Promise.all([
      provider.plan(baseRequest),
      provider.plan({ ...baseRequest, edgeId: "edge-2" }),
    ])

    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
    expect(sleep).toHaveBeenCalledWith(250)
  })
})
