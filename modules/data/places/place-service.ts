import { decideProviderMatch } from "@/lib/places/matching"
import { normalizePlaceSearchInput } from "@/lib/places/normalize"
import { planPlaceProviderSearch } from "@/lib/places/policy"
import { rankPlaceCandidates } from "@/lib/places/ranker"
import { targetCommandBodySchema } from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
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

export interface PlaceProviderUsageContext {
  userId?: string
  workspaceId?: string
  agentRunId?: string
  requestId?: string
}

type LocationEventType = "VISIT" | "STAY" | "MEAL" | "ACTIVITY"
type PlaceProviderPurpose = "place_search" | "place_enrich"
type PlaceProviderUsageLogger = (
  purpose: PlaceProviderPurpose,
  status: "success" | "error",
  code: string | undefined,
  context: PlaceProviderUsageContext
) => Promise<void>

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
    > = new AMapPlaceProvider(),
    private readonly logUsage: PlaceProviderUsageLogger = logPlaceProviderUsage
  ) {}

  async searchPlaces(
    input: PlaceSearchInput,
    usageContext?: PlaceProviderUsageContext
  ): Promise<PlaceSearchResponse> {
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
      ? await this.callProvider("place_search", query, usageContext)
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

  async resolvePlace(
    input: PlaceResolveInput,
    usageContext?: PlaceProviderUsageContext
  ): Promise<PlaceResolveResult> {
    const response = await this.searchPlaces(
      {
        query: input.text,
        city: input.city ?? input.journeyContext?.currentCity,
        limit: 5,
        includeLiveProvider: true,
        coordinatePreference: "auto",
      },
      usageContext
    )

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
    input: PlaceResolveForJourneyEventInput,
    eventType: LocationEventType,
    usageContext?: PlaceProviderUsageContext
  ): Promise<PlaceResolveForJourneyEventResult> {
    const resolved = await this.resolvePlace(input, usageContext)
    if (resolved.status !== "resolved") return resolved

    const externalSource = resolved.place.sources.find(
      (source) =>
        source.provider === resolved.place.bestCoordinate.provider &&
        source.providerId
    )
    const command: Extract<
      PlaceResolveForJourneyEventResult,
      { status: "ready" }
    >["command"] = {
      name: "journey.update_event",
      payload: {
        eventId: input.eventId,
        patch: {
          type: eventType,
          detail: {
            ...(resolved.place.placeId
              ? { plannedPlaceId: resolved.place.placeId }
              : {}),
            plannedLat: resolved.place.bestCoordinate.lat,
            plannedLng: resolved.place.bestCoordinate.lng,
            coordinateSystem: resolved.place.bestCoordinate.coordinateSystem,
            coordinateProvider: resolved.place.bestCoordinate.provider,
            ...(externalSource?.providerId
              ? { providerPlaceId: externalSource.providerId }
              : {}),
          },
        },
      },
    }
    targetCommandBodySchema.parse(command)
    return {
      status: "ready",
      place: resolved.place,
      command,
      warnings: resolved.warnings,
    }
  }

  async enrichPlace(
    input: PlaceEnrichInput,
    usageContext?: PlaceProviderUsageContext
  ): Promise<PlaceEnrichResult> {
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
    const live = await this.callProvider("place_enrich", query, usageContext)
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

  private async callProvider(
    purpose: PlaceProviderPurpose,
    query: ReturnType<typeof normalizePlaceSearchInput>,
    usageContext?: PlaceProviderUsageContext
  ) {
    try {
      const result = await this.amapProvider.search(query)
      if (usageContext) {
        const providerFailure = result.warnings.find(
          (warning) => warning.code !== "low_confidence"
        )
        await this.logUsage(
          purpose,
          providerFailure ? "error" : "success",
          providerFailure?.code,
          usageContext
        )
      }
      return result
    } catch (error) {
      if (usageContext) {
        await this.logUsage(
          purpose,
          "error",
          error instanceof Error ? error.name : "provider_error",
          usageContext
        )
      }
      throw error
    }
  }
}

export function createPlaceIntelligenceService() {
  return new PlaceIntelligenceService()
}

async function logPlaceProviderUsage(
  purpose: PlaceProviderPurpose,
  status: "success" | "error",
  code: string | undefined,
  context: PlaceProviderUsageContext
) {
  await prisma.providerUsageLog.create({
    data: {
      provider: "amap",
      purpose,
      status,
      code,
      userId: context.userId,
      workspaceId: context.workspaceId,
      agentRunId: context.agentRunId,
      requestId: context.requestId,
    },
  })
}
