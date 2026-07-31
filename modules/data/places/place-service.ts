import { decideProviderMatch } from "@/lib/places/matching"
import { normalizePlaceSearchInput } from "@/lib/places/normalize"
import { planPlaceProviderSearch } from "@/lib/places/policy"
import { rankPlaceCandidates } from "@/lib/places/ranker"
import type {
  PlaceEnrichInput,
  PlaceEnrichResult,
  PlaceResolveInput,
  PlaceResolveForJourneyEventInput,
  PlaceResolveForJourneyEventResult,
  PlaceResolveResult,
  PlaceSearchInput,
  PlaceSearchResponse,
} from "@/lib/places/types"
import { PlaceCatalogRepository } from "./place-catalog-repository"
import { AMapPlaceProvider } from "./providers/amap-place-provider"

export class PlaceIntelligenceService {
  constructor(
    private readonly repository: Pick<
      PlaceCatalogRepository,
      | "search"
      | "findById"
      | "persistLiveCandidates"
      | "linkProviderMatch"
      | "persistMatchReview"
    > = new PlaceCatalogRepository(),
    private readonly amapProvider: Pick<
      AMapPlaceProvider,
      "search"
    > = new AMapPlaceProvider()
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
      city: input.city ?? input.journeyContext?.currentCity,
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
          city: input.city ?? input.journeyContext?.currentCity,
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

  async resolvePlaceForJourneyEvent(
    input: PlaceResolveForJourneyEventInput
  ): Promise<PlaceResolveForJourneyEventResult> {
    const resolved = await this.resolvePlace(input)
    if (resolved.status !== "resolved") return resolved

    const externalSource =
      resolved.place.sources.find(
        (source) =>
          source.provider === resolved.place.bestCoordinate.provider &&
          source.providerId
      ) ??
      resolved.place.sources.find(
        (source) => source.provider !== "periplus" && source.providerId
      )
    return {
      status: "ready",
      place: resolved.place,
      linkToolCall: {
        tool: "journey.link_place",
        input: {
          eventId: input.eventId,
          place: {
            placeId: resolved.place.placeId,
            name: resolved.place.name,
            address: resolved.place.address,
            providerPlaceId: externalSource?.providerId,
            coordinate: resolved.place.bestCoordinate,
          },
        },
      },
      warnings: resolved.warnings,
    }
  }

  async enrichPlace(input: PlaceEnrichInput): Promise<PlaceEnrichResult> {
    if (!input.placeId) {
      return {
        results: [],
        matchStatus: "NO_MATCH",
        reason: "第一版 enrich 需要传入 placeId",
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
        matchStatus: "NO_MATCH",
        reason: "地点不存在",
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
      city: candidate.city ?? candidate.province,
      categories: [candidate.category],
      limit: 5,
      coordinatePreference: "auto",
    })
    const live = await this.amapProvider.search(query)
    const results = rankPlaceCandidates(query, live.candidates)
    const decision = decideProviderMatch(results)
    if (decision.status === "NO_MATCH") {
      return {
        placeId: input.placeId,
        results,
        warnings: live.warnings,
        matchStatus: decision.status,
        reason: decision.reason,
      }
    }

    if (decision.status === "AUTO_APPROVED") {
      await this.repository.linkProviderMatch(input.placeId, decision.candidate)
      return {
        placeId: input.placeId,
        results,
        warnings: live.warnings,
        matchStatus: decision.status,
        reason: decision.reason,
      }
    }

    const reviewCandidateId = await this.repository.persistMatchReview(
      input.placeId,
      decision.candidate,
      decision.reason
    )
    return {
      placeId: input.placeId,
      results,
      warnings: live.warnings,
      matchStatus: decision.status,
      reviewCandidateId,
      reason: decision.reason,
    }
  }
}

export function createPlaceIntelligenceService() {
  return new PlaceIntelligenceService()
}
