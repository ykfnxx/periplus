import { periplusServerConfig } from "@/config/periplus.server"
import {
  isAttractionCategory,
  isAttractionSearch,
} from "@/lib/places/attractions"
import { parseLngLat } from "@/lib/places/coordinates"
import { normalizePlaceName } from "@/lib/places/normalize"
import type {
  NormalizedPlaceQuery,
  PlaceCandidate,
  PlaceCategory,
  ProviderWarning,
} from "@/lib/places/types"

interface AMapPoi {
  id?: string
  name?: string
  type?: string
  typecode?: string
  address?: string | unknown[]
  location?: string
  pname?: string
  cityname?: string
  adname?: string
  adcode?: string
  photos?: Array<{ title?: string; url?: string }>
}

interface AMapSearchResponse {
  status?: string
  infocode?: string
  info?: string
  pois?: AMapPoi[]
  locations?: string
}

export interface AMapSearchOutput {
  candidates: PlaceCandidate[]
  warnings: ProviderWarning[]
}

function categoryFromAmap(poi: AMapPoi): PlaceCategory {
  const type = `${poi.type ?? ""} ${poi.typecode ?? ""}`
  if (/风景名胜|景点|纪念馆|寺庙|教堂|公园|1102|1101/.test(type)) {
    return type.includes("公园") ? "PARK" : "SIGHT"
  }
  if (/博物馆|展览馆|科技馆|美术馆|1401/.test(type)) return "MUSEUM"
  if (/剧场|剧院|演出|音乐厅|文化宫|1403|0806/.test(type)) {
    return "PERFORMANCE"
  }
  if (/体育|运动|0801/.test(type)) return "SPORTS"
  if (/餐饮|美食|050/.test(type)) return "RESTAURANT"
  if (/酒店|宾馆|100/.test(type)) return "HOTEL"
  if (/交通|机场|火车站|地铁|公交|150/.test(type)) return "TRANSIT"
  if (/娱乐|游乐|080/.test(type)) return "ENTERTAINMENT"
  return "OTHER"
}

function stringField(value: string | unknown[] | undefined) {
  return typeof value === "string" ? value : undefined
}

function httpsUrl(value: string | undefined) {
  if (!value) return undefined
  try {
    return new URL(value).protocol === "https:" ? value : undefined
  } catch {
    return undefined
  }
}

function poiToCandidate(
  poi: AMapPoi,
  includeAttractionImages: boolean
): PlaceCandidate | null {
  if (!poi.name || !poi.location) return null
  const parsedLocation = parseLngLat(poi.location)
  if (!parsedLocation) return null
  const category = categoryFromAmap(poi)

  return {
    candidateId: `amap-${poi.id ?? normalizePlaceName(poi.name)}`,
    provider: "amap",
    providerId: poi.id,
    name: poi.name,
    normalizedName: normalizePlaceName(poi.name),
    aliases: [],
    category,
    address: stringField(poi.address),
    province: poi.pname,
    city: poi.cityname,
    district: poi.adname,
    images:
      includeAttractionImages && isAttractionCategory(category)
        ? (poi.photos ?? [])
            .flatMap((photo) => {
              const url = httpsUrl(photo.url)
              return url
                ? [
                    {
                      provider: "amap" as const,
                      url,
                      title: photo.title,
                      fetchedAt: new Date().toISOString(),
                    },
                  ]
                : []
            })
            .slice(0, 3)
        : undefined,
    coordinates: [
      {
        provider: "amap",
        coordinateSystem: "GCJ02",
        lat: parsedLocation.lat,
        lng: parsedLocation.lng,
        accuracy: "provider_poi",
        source: "provider_search",
      },
    ],
    sources: [
      {
        provider: "amap",
        providerId: poi.id,
        confidence: 0.8,
      },
    ],
    sourceConfidence: 0.8,
    fromLiveProvider: true,
  }
}

function isQuotaError(response: AMapSearchResponse) {
  return response.infocode === "10004" || response.infocode === "10044"
}

async function fetchJson(
  url: URL,
  timeoutMs: number
): Promise<AMapSearchResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    return (await response.json()) as AMapSearchResponse
  } finally {
    clearTimeout(timeout)
  }
}

export class AMapPlaceProvider {
  async search(query: NormalizedPlaceQuery): Promise<AMapSearchOutput> {
    const key = periplusServerConfig.amap.webServiceKey
    if (!key) {
      return {
        candidates: [],
        warnings: [
          {
            provider: "amap",
            code: "provider_error",
            message:
              "缺少 PERIPLUS_AMAP_WEB_SERVICE_KEY 或 NEXT_PUBLIC_AMAP_KEY",
          },
        ],
      }
    }

    if (query.near) return this.searchAround(query, key)
    return this.searchByKeyword(query, key)
  }

  private async searchByKeyword(
    query: NormalizedPlaceQuery,
    key: string
  ): Promise<AMapSearchOutput> {
    if (!query.query) return { candidates: [], warnings: [] }

    const url = new URL("https://restapi.amap.com/v3/place/text")
    url.searchParams.set("key", key)
    url.searchParams.set("keywords", query.query)
    if (query.city || query.adcode)
      url.searchParams.set("city", query.adcode ?? query.city!)
    url.searchParams.set(
      "citylimit",
      query.city || query.adcode ? "true" : "false"
    )
    url.searchParams.set("offset", String(Math.min(query.limit, 20)))
    url.searchParams.set("page", "1")
    url.searchParams.set(
      "extensions",
      isAttractionSearch(query) ? "all" : "base"
    )

    return this.fetchCandidates(url, isAttractionSearch(query))
  }

  private async searchAround(
    query: NormalizedPlaceQuery,
    key: string
  ): Promise<AMapSearchOutput> {
    if (!query.near) return { candidates: [], warnings: [] }
    const location = await this.locationForAroundSearch(query, key)
    if (!location.location) {
      return { candidates: [], warnings: location.warnings }
    }

    const url = new URL("https://restapi.amap.com/v3/place/around")
    url.searchParams.set("key", key)
    if (query.query) url.searchParams.set("keywords", query.query)
    url.searchParams.set("location", location.location)
    url.searchParams.set("radius", String(query.radiusMeters ?? 3000))
    url.searchParams.set("offset", String(Math.min(query.limit, 20)))
    url.searchParams.set("page", "1")
    url.searchParams.set(
      "extensions",
      isAttractionSearch(query) ? "all" : "base"
    )

    const result = await this.fetchCandidates(url, isAttractionSearch(query))
    return {
      candidates: result.candidates,
      warnings: [...location.warnings, ...result.warnings],
    }
  }

  private async locationForAroundSearch(
    query: NormalizedPlaceQuery,
    key: string
  ): Promise<{ location: string | null; warnings: ProviderWarning[] }> {
    if (!query.near) return { location: null, warnings: [] }
    if (query.near.coordinateSystem === "GCJ02") {
      return {
        location: `${query.near.lng},${query.near.lat}`,
        warnings: [],
      }
    }

    const coordsys = query.near.coordinateSystem === "BD09LL" ? "baidu" : "gps"
    const url = new URL(
      "https://restapi.amap.com/v3/assistant/coordinate/convert"
    )
    url.searchParams.set("key", key)
    url.searchParams.set("locations", `${query.near.lng},${query.near.lat}`)
    url.searchParams.set("coordsys", coordsys)

    try {
      const response = await fetchJson(url, 1000)
      const location = response.locations?.split(";")[0]
      if (response.status === "1" && location && parseLngLat(location)) {
        return { location, warnings: [] }
      }
      return {
        location: null,
        warnings: [
          {
            provider: "amap",
            code: isQuotaError(response) ? "quota_exceeded" : "provider_error",
            message: response.info ?? "高德坐标转换失败",
          },
        ],
      }
    } catch (error) {
      return {
        location: null,
        warnings: [
          {
            provider: "amap",
            code:
              error instanceof Error && error.name === "AbortError"
                ? "timeout"
                : "provider_error",
            message:
              error instanceof Error ? error.message : "高德坐标转换失败",
          },
        ],
      }
    }
  }

  private async fetchCandidates(
    url: URL,
    includeAttractionImages: boolean
  ): Promise<AMapSearchOutput> {
    try {
      const response = await fetchJson(url, 2500)
      if (response.status !== "1") {
        return {
          candidates: [],
          warnings: [
            {
              provider: "amap",
              code: isQuotaError(response)
                ? "quota_exceeded"
                : "provider_error",
              message: response.info ?? "高德 POI 查询失败",
            },
          ],
        }
      }

      return {
        candidates: (response.pois ?? [])
          .map((poi) => poiToCandidate(poi, includeAttractionImages))
          .filter((candidate): candidate is PlaceCandidate =>
            Boolean(candidate)
          ),
        warnings: [],
      }
    } catch (error) {
      return {
        candidates: [],
        warnings: [
          {
            provider: "amap",
            code:
              error instanceof Error && error.name === "AbortError"
                ? "timeout"
                : "provider_error",
            message:
              error instanceof Error ? error.message : "高德 POI 查询失败",
          },
        ],
      }
    }
  }
}
