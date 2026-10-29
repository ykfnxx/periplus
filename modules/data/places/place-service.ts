import { decideProviderMatch } from "@/lib/places/matching"
import { normalizePlaceSearchInput } from "@/lib/places/normalize"
import { rankPlaceCandidates } from "@/lib/places/ranker"
import type { PlaceEnrichInput, PlaceEnrichResult } from "@/lib/places/types"
import { PlaceCatalogRepository } from "./place-catalog-repository"
import { AMapPlaceProvider } from "./providers/amap-place-provider"
import { queryWithRetry } from "../providers/query-retry"

interface PlaceServiceRetryOptions {
  sleep?: (milliseconds: number) => Promise<void>
  random?: () => number
}

export class PlaceIntelligenceService {
  constructor(
    private readonly repository: Pick<
      PlaceCatalogRepository,
      "findById" | "linkProviderMatch" | "persistMatchReview"
    > = new PlaceCatalogRepository(),
    private readonly amapProvider: Pick<
      AMapPlaceProvider,
      "search"
    > = new AMapPlaceProvider(),
    private readonly retry: PlaceServiceRetryOptions = {}
  ) {}

  async enrichPlace(input: PlaceEnrichInput): Promise<PlaceEnrichResult> {
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
    const live = await this.callProvider(query)
    const results = rankPlaceCandidates(query, live.candidates)
    const decision = decideProviderMatch(results)
    const warnings = [...live.warnings]
    if (decision.status === "NO_MATCH") {
      return {
        placeId: input.placeId,
        results,
        warnings,
        providerAttempts: live.providerAttempts,
        matchStatus: decision.status,
        reason: decision.reason,
      }
    }

    if (decision.status === "AUTO_APPROVED") {
      await this.repository.linkProviderMatch(input.placeId, decision.candidate)
      return {
        placeId: input.placeId,
        results,
        warnings,
        providerAttempts: live.providerAttempts,
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
      warnings,
      providerAttempts: live.providerAttempts,
      matchStatus: decision.status,
      reviewCandidateId,
      reason: decision.reason,
    }
  }

  private async callProvider(
    query: ReturnType<typeof normalizePlaceSearchInput>
  ) {
    const retried = await queryWithRetry({
      operation: () => this.amapProvider.search(query),
      failure: (result) => {
        const warning = result.warnings[0]
        return warning
          ? {
              retryable: warning.retryable === true,
              rateLimited: warning.code === "rate_limited",
            }
          : undefined
      },
      sleep: this.retry.sleep,
      random: this.retry.random,
    })
    const failure = retried.result.warnings[0]
    const result = {
      ...retried.result,
      providerAttempts: retried.attempts,
      warnings: retried.result.warnings.map((warning) =>
        warning === failure
          ? {
              ...warning,
              attempts: retried.attempts,
              exhausted: retried.exhausted,
            }
          : warning
      ),
    }
    return result
  }
}
