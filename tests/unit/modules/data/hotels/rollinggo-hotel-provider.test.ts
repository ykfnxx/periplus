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
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
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
        }),
        { status: 200 }
      )
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
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mcp.rollinggo.cn/mcp",
      expect.objectContaining({ method: "POST" })
    )
  })
})
