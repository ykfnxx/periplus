import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { periplusServerConfig } from "@/config/periplus.server"
import type {
  HotelCandidate,
  HotelProviderWarning,
  HotelSearchInput,
  HotelSearchResponse,
} from "@/lib/hotels/types"

interface RollingGoHotel {
  hotelId?: string | number
  name?: string
  address?: string
  latitude?: number
  longitude?: number
  bookingUrl?: string
  imageUrl?: string
  price?: {
    hasPrice?: boolean
    currency?: string
    lowestPrice?: number
  }
}

interface RollingGoSearchResult {
  message?: string
  hotelInformationList?: RollingGoHotel[]
}

interface RollingGoMcpToolResult {
  content?: Array<{ type?: string; text?: string }>
}

function httpsUrl(value: string | undefined) {
  if (!value) return undefined
  try {
    return new URL(value).protocol === "https:" ? value : undefined
  } catch {
    return undefined
  }
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function normalizedSize(size: number | undefined) {
  return Math.min(Math.max(size ?? 5, 1), 10)
}

function parseSearchResult(response: RollingGoMcpToolResult) {
  const text = response.content?.find(
    (content) => content.type === "text" && content.text
  )?.text
  if (!text) throw new Error("RollingGo returned no hotel search result")
  return JSON.parse(text) as RollingGoSearchResult
}

function mapHotel(
  hotel: RollingGoHotel,
  fetchedAt: string
): HotelCandidate | null {
  const providerHotelId =
    hotel.hotelId == null ? undefined : String(hotel.hotelId)
  if (
    !providerHotelId ||
    !hotel.name ||
    !isFiniteCoordinate(hotel.latitude) ||
    !isFiniteCoordinate(hotel.longitude)
  ) {
    return null
  }
  const price = hotel.price
  const startingPrice =
    price?.hasPrice &&
    typeof price.lowestPrice === "number" &&
    price.lowestPrice >= 0 &&
    price.currency
      ? { amount: price.lowestPrice, currency: price.currency }
      : undefined

  return {
    candidateId: `rollinggo-${providerHotelId}`,
    provider: "rollinggo",
    providerHotelId,
    name: hotel.name,
    address: hotel.address || undefined,
    coordinates: { lat: hotel.latitude, lng: hotel.longitude },
    startingPrice,
    imageUrl: httpsUrl(hotel.imageUrl),
    externalUrl: httpsUrl(hotel.bookingUrl),
    fetchedAt,
  }
}

export class RollingGoHotelProvider {
  async search(
    input: HotelSearchInput,
    signal?: AbortSignal
  ): Promise<HotelSearchResponse> {
    const apiKey = periplusServerConfig.rollinggo.apiKey
    if (!apiKey) {
      return {
        candidates: [],
        warnings: [
          {
            provider: "rollinggo",
            code: "provider_error",
            message: "缺少 PERIPLUS_ROLLINGGO_API_KEY",
            retryable: false,
          },
        ],
      }
    }

    const transport = new StreamableHTTPClientTransport(
      new URL(periplusServerConfig.rollinggo.hotelUrl),
      {
        requestInit: {
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      }
    )
    const client = new Client({ name: "periplus-rollinggo", version: "1.0.0" })
    let timedOut = false
    let aborted = false
    const timeout = setTimeout(() => {
      timedOut = true
      void client.close()
    }, 8_000)
    const abortFromParent = () => {
      aborted = true
      void client.close()
    }
    if (signal?.aborted) abortFromParent()
    else signal?.addEventListener("abort", abortFromParent, { once: true })
    try {
      signal?.throwIfAborted()
      await client.connect(transport, { timeout: 8_000 })
      const result = parseSearchResult(
        (await client.callTool(
          {
            name: "searchHotels",
            arguments: {
              originQuery: input.originQuery,
              place: input.place,
              placeType: input.placeType,
              countryCode: input.countryCode,
              size: normalizedSize(input.size),
              checkInParam: {
                checkInDate: input.checkInDate,
                stayNights: input.stayNights,
                adultCount: input.adultCount,
              },
            },
          },
          undefined,
          { timeout: 8_000 }
        )) as RollingGoMcpToolResult
      )
      const fetchedAt = new Date().toISOString()
      return {
        candidates: (result.hotelInformationList ?? [])
          .map((hotel) => mapHotel(hotel, fetchedAt))
          .filter((hotel): hotel is HotelCandidate => Boolean(hotel))
          .slice(0, normalizedSize(input.size)),
        warnings: [],
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "RollingGo 酒店检索失败"
      const timeoutError =
        timedOut || /time(?:d)?\s*out|TimeoutError/i.test(message)
      const rateLimited = /(?:CU)?QPS|429|RATE.?LIMIT/i.test(message)
      const quotaExceeded = /QUOTA|BALANCE|额度|余额/i.test(message)
      const retryableProviderError =
        /fetch|network|ECONN|socket|temporar|5\d\d/i.test(message)
      const warning: HotelProviderWarning = {
        provider: "rollinggo",
        code: timeoutError
          ? "timeout"
          : rateLimited
            ? "rate_limited"
            : quotaExceeded
              ? "quota_exceeded"
              : "provider_error",
        message,
        retryable:
          !aborted &&
          (timeoutError ||
            rateLimited ||
            (!quotaExceeded && retryableProviderError)),
      }
      return { candidates: [], warnings: [warning] }
    } finally {
      clearTimeout(timeout)
      signal?.removeEventListener("abort", abortFromParent)
      await client.close()
    }
  }
}
