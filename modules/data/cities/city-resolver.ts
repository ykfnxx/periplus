import { periplusServerConfig } from "@/config/periplus.server"
import { parseLngLat } from "@/lib/places/coordinates"
import { normalizePlaceName } from "@/lib/places/normalize"
import type { PlaceRef, ProviderWarning } from "@/lib/places/types"

const CITY_SUFFIX = /(?:特别行政区|自治州|地区|盟|省|市)$/u
const ACCEPTED_LEVELS = new Set(["province", "city"])

interface AMapDistrict {
  adcode?: string
  name?: string
  center?: string
  level?: string
}

interface AMapDistrictResponse {
  status?: string
  info?: string
  districts?: AMapDistrict[]
}

export interface CanonicalCity {
  provider: "amap"
  providerCityId: string
  name: string
  administrativeLevel: "province" | "city"
  timeZone: "Asia/Shanghai"
  location: PlaceRef
}

export type CityResolveResult =
  | { status: "resolved"; city: CanonicalCity }
  | { status: "not_found"; reason: string; warnings: ProviderWarning[] }

function canonicalCityName(value: string) {
  return normalizePlaceName(value).replace(CITY_SUFFIX, "")
}

function providerWarning(message: string): ProviderWarning {
  return {
    provider: "amap",
    code: "provider_error",
    message,
    retryable: false,
  }
}

export class CityResolver {
  async resolveCity(
    query: string,
    signal?: AbortSignal
  ): Promise<CityResolveResult> {
    const key = periplusServerConfig.amap.webServiceKey
    if (!key) {
      return {
        status: "not_found",
        reason: "CITY_PROVIDER_UNAVAILABLE",
        warnings: [providerWarning("缺少 PERIPLUS_AMAP_WEB_SERVICE_KEY")],
      }
    }

    const url = new URL("https://restapi.amap.com/v3/config/district")
    url.searchParams.set("key", key)
    url.searchParams.set("keywords", query)
    url.searchParams.set("subdistrict", "0")
    url.searchParams.set("extensions", "base")

    const timeoutSignal = AbortSignal.timeout(2_500)
    const requestSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal
    let response: Response
    try {
      response = await fetch(url, { signal: requestSignal })
    } catch (error) {
      return {
        status: "not_found",
        reason: "CITY_PROVIDER_UNAVAILABLE",
        warnings: [
          providerWarning(
            error instanceof Error ? error.message : "高德行政区查询失败"
          ),
        ],
      }
    }
    if (!response.ok) {
      return {
        status: "not_found",
        reason: "CITY_PROVIDER_UNAVAILABLE",
        warnings: [providerWarning(`高德行政区查询 HTTP ${response.status}`)],
      }
    }

    const body = (await response.json()) as AMapDistrictResponse
    if (body.status !== "1") {
      return {
        status: "not_found",
        reason: "CITY_PROVIDER_UNAVAILABLE",
        warnings: [providerWarning(body.info ?? "高德行政区查询失败")],
      }
    }

    const normalizedQuery = canonicalCityName(query)
    const district = (body.districts ?? []).find(
      (candidate) =>
        candidate.name &&
        candidate.adcode &&
        candidate.center &&
        candidate.level &&
        ACCEPTED_LEVELS.has(candidate.level) &&
        canonicalCityName(candidate.name) === normalizedQuery
    )
    const center = district?.center ? parseLngLat(district.center) : null
    if (!district?.name || !district.adcode || !district.level || !center) {
      return {
        status: "not_found",
        reason: "CITY_NOT_FOUND",
        warnings: [],
      }
    }

    const administrativeLevel = district.level as "province" | "city"
    return {
      status: "resolved",
      city: {
        provider: "amap",
        providerCityId: district.adcode,
        name: district.name,
        administrativeLevel,
        timeZone: "Asia/Shanghai",
        location: {
          provider: "amap",
          providerId: district.adcode,
          canonicalName: district.name,
          city: district.name,
          lat: center.lat,
          lng: center.lng,
          coordinateSystem: "GCJ02",
          confidence: 1,
          candidates: [
            {
              id: district.adcode,
              name: district.name,
              city: district.name,
              confidence: 1,
            },
          ],
        },
      },
    }
  }
}

export function createCityResolver() {
  return new CityResolver()
}
