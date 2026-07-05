import { normalizePlaceSearchInput } from "./normalize"
import { planPlaceProviderSearch } from "./policy"
import { AMapPlaceProvider } from "./providers/amap"
import { rankPlaceCandidates } from "./ranker"
import { PlaceCatalogRepository } from "./repository"
import type {
  PlaceEnrichInput,
  PlaceResolveInput,
  PlaceResolveResult,
  PlaceSearchInput,
  PlaceSearchResponse,
} from "./types"

export class PlaceIntelligenceService {
  constructor(
    private readonly repository = new PlaceCatalogRepository(),
    private readonly amapProvider = new AMapPlaceProvider()
  ) {}

  async searchPlaces(input: PlaceSearchInput): Promise<PlaceSearchResponse> {
    const query = normalizePlaceSearchInput(input)
    const warnings: PlaceSearchResponse["warnings"] = []
    const local = await this.repository.search(query).catch((error) => {
      warnings.push({
        provider: "periplus",
        code: "provider_error",
        message:
          error instanceof Error
            ? `本地地点库查询失败：${error.message}`
            : "本地地点库查询失败",
      })
      return { candidates: [], topConfidence: 0 }
    })
    const plan = planPlaceProviderSearch(query, local)
    const live = plan.useAmap
      ? await this.amapProvider.search(query)
      : { candidates: [], warnings: [] }

    const results = rankPlaceCandidates(query, [
      ...local.candidates,
      ...live.candidates,
    ])

    if (plan.writeBack === "cache_only") {
      await this.repository
        .persistLiveCandidates(query, live.candidates)
        .catch((error) => {
          warnings.push({
            provider: "periplus",
            code: "provider_error",
            message:
              error instanceof Error
                ? `地点候选缓存写入失败：${error.message}`
                : "地点候选缓存写入失败",
          })
        })
    }

    return {
      results,
      warnings: [...warnings, ...live.warnings],
    }
  }

  async resolvePlace(input: PlaceResolveInput): Promise<PlaceResolveResult> {
    const response = await this.searchPlaces({
      query: input.text,
      city: input.city ?? input.routeContext?.currentCity,
      limit: 5,
      includeLiveProvider: true,
      coordinatePreference: "auto",
    })

    const [first, second] = response.results
    if (!first) {
      return {
        status: "not_found",
        fallbackQuery: {
          query: input.text,
          city: input.city ?? input.routeContext?.currentCity,
        },
        reason: "本地地点库和实时 provider 都没有返回可用地点",
        warnings: response.warnings,
      }
    }

    const isClearWinner =
      first.quality === "verified" ||
      (!input.requireExact &&
        first.quality === "probable" &&
        (!second || first.confidence - second.confidence >= 0.12))

    if (isClearWinner && !first.needsUserConfirmation) {
      return { status: "resolved", place: first, warnings: response.warnings }
    }

    return {
      status: "ambiguous",
      candidates: response.results,
      question: `找到多个可能的“${input.text}”，需要确认具体地点。`,
      warnings: response.warnings,
    }
  }

  async enrichPlace(input: PlaceEnrichInput): Promise<PlaceSearchResponse> {
    if (!input.placeId) {
      return {
        results: [],
        warnings: [
          {
            provider: input.provider ?? "periplus",
            code: "provider_error",
            message: "第一版 enrich 需要传入 placeId",
          },
        ],
      }
    }

    const candidate = await this.repository.findById(input.placeId)
    if (!candidate) {
      return {
        results: [],
        warnings: [
          {
            provider: "periplus",
            code: "provider_error",
            message: "地点不存在",
          },
        ],
      }
    }

    const query = normalizePlaceSearchInput({
      query: candidate.name,
      limit: 1,
      coordinatePreference: "auto",
    })
    return {
      results: rankPlaceCandidates(query, [candidate]),
      warnings: [],
    }
  }
}

export function createPlaceIntelligenceService() {
  return new PlaceIntelligenceService()
}
