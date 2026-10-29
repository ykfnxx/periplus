import { decideProviderMatch } from "@/lib/places/matching"
import { normalizePlaceSearchInput } from "@/lib/places/normalize"
import { rankPlaceCandidates } from "@/lib/places/ranker"
import type { PlaceEnrichInput, PlaceEnrichResult } from "@/lib/places/types"
import { PlaceCatalogRepository } from "./place-catalog-repository"
import { AMapPlaceProvider } from "./providers/amap-place-provider"

export class PlaceIntelligenceService {
  constructor(
    private readonly repository: Pick<
      PlaceCatalogRepository,
      "findById" | "linkProviderMatch" | "persistMatchReview"
    > = new PlaceCatalogRepository(),
    private readonly amapProvider: Pick<
      AMapPlaceProvider,
      "search"
    > = new AMapPlaceProvider()
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
    const live = await this.amapProvider.search(query)
    const results = rankPlaceCandidates(query, live.candidates)
    const decision = decideProviderMatch(results)
    const warnings = [...live.warnings]
    if (decision.status === "NO_MATCH") {
      return {
        placeId: input.placeId,
        results,
        warnings,
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
      matchStatus: decision.status,
      reviewCandidateId,
      reason: decision.reason,
    }
  }
}
