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

interface RollingGoMcpResponse {
  result?: {
    content?: Array<{ type?: string; text?: string }>
  }
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

function parseSearchResult(response: RollingGoMcpResponse) {
  const text = response.result?.content?.find(
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
  async search(input: HotelSearchInput): Promise<HotelSearchResponse> {
    const apiKey = periplusServerConfig.rollinggo.apiKey
    if (!apiKey) {
      return {
        candidates: [],
        warnings: [
          {
            provider: "rollinggo",
            code: "provider_error",
            message: "缺少 PERIPLUS_ROLLINGGO_API_KEY",
          },
        ],
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8_000)
    try {
      const response = await fetch(periplusServerConfig.rollinggo.hotelUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "tools/call",
          params: {
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
          id: 1,
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        return {
          candidates: [],
          warnings: [
            {
              provider: "rollinggo",
              code:
                response.status === 429 ? "quota_exceeded" : "provider_error",
              message: `RollingGo 酒店检索失败 (${response.status})`,
            },
          ],
        }
      }

      const result = parseSearchResult(
        (await response.json()) as RollingGoMcpResponse
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
      const warning: HotelProviderWarning = {
        provider: "rollinggo",
        code:
          error instanceof Error && error.name === "AbortError"
            ? "timeout"
            : "provider_error",
        message:
          error instanceof Error ? error.message : "RollingGo 酒店检索失败",
      }
      return { candidates: [], warnings: [warning] }
    } finally {
      clearTimeout(timeout)
    }
  }
}
