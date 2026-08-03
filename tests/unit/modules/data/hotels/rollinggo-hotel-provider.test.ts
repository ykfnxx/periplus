import { afterEach, describe, expect, it, vi } from "vitest"
import { RollingGoHotelProvider } from "@/modules/data/hotels/providers/rollinggo-hotel-provider"

const originalKey = process.env.PERIPLUS_ROLLINGGO_API_KEY
const originalFetch = global.fetch

afterEach(() => {
  if (originalKey === undefined) delete process.env.PERIPLUS_ROLLINGGO_API_KEY
  else process.env.PERIPLUS_ROLLINGGO_API_KEY = originalKey
  global.fetch = originalFetch
})

describe("RollingGoHotelProvider", () => {
  it("normalizes multiple hotel candidates from the search MCP result", async () => {
    process.env.PERIPLUS_ROLLINGGO_API_KEY = "test-key"
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        const request = JSON.parse(String(init?.body)) as {
          id?: number
          method: string
        }
        if (request.method === "initialize") {
          return new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: request.id,
              result: {
                protocolVersion: "2025-11-25",
                capabilities: { tools: {} },
                serverInfo: { name: "rollinggo", version: "1.0.0" },
              },
            }),
            {
              headers: {
                "content-type": "application/json",
                "mcp-session-id": "rollinggo-session",
              },
            }
          )
        }
        if (request.method === "notifications/initialized") {
          return new Response(null, { status: 202 })
        }
        return new Response(
          `event: message\ndata: ${JSON.stringify({
            jsonrpc: "2.0",
            id: request.id,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    hotelInformationList: [
                      {
                        hotelId: 42,
                        name: "测试酒店",
                        address: "西安市中心",
                        latitude: 34.26,
                        longitude: 108.94,
                        imageUrl: "https://images.example/hotel.jpg",
                        bookingUrl: "https://booking.example/hotel/42",
                        price: {
                          hasPrice: true,
                          currency: "CNY",
                          lowestPrice: 680,
                        },
                      },
                      { hotelId: 43, name: "缺坐标酒店" },
                    ],
                  }),
                },
              ],
            },
          })}\n\n`,
          { headers: { "content-type": "text/event-stream" } }
        )
      }
    )
    global.fetch = fetchMock

    const result = await new RollingGoHotelProvider().search({
      originQuery: "西安酒店",
      place: "西安",
      placeType: "城市",
    })

    expect(result.warnings).toEqual([])
    expect(result.candidates).toMatchObject([
      {
        candidateId: "rollinggo-42",
        name: "测试酒店",
        address: "西安市中心",
        coordinates: { lat: 34.26, lng: 108.94 },
        startingPrice: { amount: 680, currency: "CNY" },
        imageUrl: "https://images.example/hotel.jpg",
        externalUrl: "https://booking.example/hotel/42",
      },
    ])
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://mcp.rollinggo.cn/mcp"
    )
    const requests = fetchMock.mock.calls
      .map(([, init]) => init as RequestInit)
      .filter((init) => init.body)
    expect(
      requests.map((init) => JSON.parse(String(init.body)).method)
    ).toEqual(["initialize", "notifications/initialized", "tools/call"])
    expect(new Headers(requests.at(-1)?.headers).get("mcp-session-id")).toBe(
      "rollinggo-session"
    )
  })

  it("closes the MCP transport and returns a timeout after eight seconds", async () => {
    process.env.PERIPLUS_ROLLINGGO_API_KEY = "test-key"
    let aborted = false
    const fetchMock = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true
            reject(new DOMException("aborted", "AbortError"))
          })
        })
    )
    global.fetch = fetchMock

    const pending = new RollingGoHotelProvider().search({
      originQuery: "西安酒店",
      place: "西安",
      placeType: "城市",
    })
    await expect(pending).resolves.toMatchObject({
      candidates: [],
      warnings: [{ code: "timeout" }],
    })
    expect(aborted).toBe(true)
  }, 10_000)
})
