import { decideProviderMatch } from "@/lib/places/matching"
import {
  normalizePlaceName,
  normalizePlaceSearchInput,
} from "@/lib/places/normalize"
import { planPlaceProviderSearch } from "@/lib/places/policy"
import { rankPlaceCandidates } from "@/lib/places/ranker"
import { prisma } from "@/modules/data/db/prisma"
import type {
  PlaceEnrichInput,
  PlaceEnrichResult,
  PlaceResolveInput,
  PlaceResolveResult,
  PlaceRef,
  PlaceImage,
  PlaceSearchInput,
  PlaceSearchResult,
  PlaceSearchResponse,
} from "@/lib/places/types"
import { PlaceCatalogRepository } from "./place-catalog-repository"
import { AMapPlaceProvider } from "./providers/amap-place-provider"
import { queryWithRetry } from "../providers/query-retry"

export interface PlaceProviderUsageContext {
  userId?: string
  workspaceId?: string
  agentRunId?: string
  requestId?: string
  signal?: AbortSignal
}

export function placeRefFromResult(
  place: PlaceSearchResult,
  candidates: readonly PlaceSearchResult[]
): PlaceRef {
  const source = place.sources.find(
    (candidate) => candidate.provider === place.bestCoordinate.provider
  )
  return {
    provider: place.bestCoordinate.provider,
    providerId: source?.providerId,
    canonicalName: place.name,
    city: place.city ?? place.province,
    address: place.address,
    lat: place.bestCoordinate.lat,
    lng: place.bestCoordinate.lng,
    coordinateSystem: place.bestCoordinate.coordinateSystem,
    confidence: place.confidence,
    candidates: candidates.map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      city: candidate.city ?? candidate.province,
      confidence: candidate.confidence,
    })),
  }
}

type PlaceProviderPurpose = "place_search" | "place_enrich"
type PlaceProviderUsageLogger = (
  purpose: PlaceProviderPurpose,
  status: "success" | "error",
  code: string | undefined,
  context: PlaceProviderUsageContext
) => Promise<void>

type ImageProbe = (url: string, signal?: AbortSignal) => Promise<boolean>

interface PlaceServiceRetryOptions {
  sleep?: (milliseconds: number) => Promise<void>
  random?: () => number
  now?: () => number
}

const PROVIDER_CIRCUIT_TTL_MS = 2 * 60 * 1_000

function providerFailureWarning(warnings: PlaceSearchResponse["warnings"]) {
  return warnings.find(
    (warning) =>
      warning.code !== "low_confidence" &&
      warning.code !== "IMAGE_UNAVAILABLE" &&
      warning.code !== "UNVERIFIED_FALLBACK"
  )
}

async function probeImage(url: string, signal?: AbortSignal) {
  const timeoutSignal = AbortSignal.timeout(3_000)
  const response = await fetch(url, {
    method: "HEAD",
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
  })
  return response.ok
}

export class PlaceIntelligenceService {
  private readonly providerCircuitUntil = new Map<string, number>()

  private openProviderCircuit(circuitKey: string, until: number) {
    this.providerCircuitUntil.set(circuitKey, until)
    const cleanup = setTimeout(() => {
      if (this.providerCircuitUntil.get(circuitKey) === until) {
        this.providerCircuitUntil.delete(circuitKey)
      }
    }, PROVIDER_CIRCUIT_TTL_MS)
    cleanup.unref?.()
  }

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
    private readonly logUsage: PlaceProviderUsageLogger = logPlaceProviderUsage,
    private readonly imageProbe: ImageProbe = probeImage,
    private readonly retry: PlaceServiceRetryOptions = {}
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
      : { candidates: [], warnings: [], providerAttempts: 0 }

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
      providerAttempts: live.providerAttempts,
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
        intent: input.intent,
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
        fallbackAllowed:
          usageContext?.signal?.aborted !== true &&
          response.warnings.some((warning) => warning.exhausted === true),
        warnings: response.warnings,
        providerAttempts: response.providerAttempts,
      }
    }

    const normalized = normalizePlaceSearchInput({
      query: input.text,
    }).normalizedQuery
    const exactMatch =
      first.normalizedName === normalized ||
      first.aliases.includes(normalized ?? "")
    const requestedCity = input.city ?? input.journeyContext?.currentCity
    const normalizedRequestedCity = requestedCity
      ? normalizePlaceName(requestedCity).replace(/市$/, "")
      : undefined
    const cityMatches =
      !normalizedRequestedCity ||
      [first.city, first.province, first.district].some((value) => {
        if (!value) return false
        const normalizedValue = normalizePlaceName(value).replace(/市$/, "")
        return (
          normalizedValue.includes(normalizedRequestedCity) ||
          normalizedRequestedCity.includes(normalizedValue)
        )
      })
    const requestedCategories = normalizePlaceSearchInput({
      intent: input.intent,
    }).categories
    const categoryMatches =
      requestedCategories.length === 0 ||
      requestedCategories.includes(first.category)
    const exactActionableMatch =
      exactMatch && cityMatches && categoryMatches && first.canAddToJourney
    const isClearWinner =
      first.canAddToJourney &&
      (exactActionableMatch ||
        !second ||
        first.confidence - second.confidence >= 0.1)

    if (isClearWinner) {
      return {
        status: "resolved",
        place: first,
        placeRef: placeRefFromResult(first, response.results),
        warnings: response.warnings,
        providerAttempts: response.providerAttempts,
      }
    }

    return {
      status: "ambiguous",
      candidates: response.results,
      question: `找到多个可能的“${input.text}”，需要确认具体地点。`,
      warnings: response.warnings,
      providerAttempts: response.providerAttempts,
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
    let results = rankPlaceCandidates(query, live.candidates)
    const decision = decideProviderMatch(results)
    const warnings = [...live.warnings]
    if (input.fields.includes("images")) {
      results = await Promise.all(
        results.map(async (result) => ({
          ...result,
          images: result.images
            ? (
                await Promise.all(
                  result.images.map((image) =>
                    this.availableImage(image, warnings, usageContext?.signal)
                  )
                )
              ).filter((image): image is PlaceImage => Boolean(image))
            : undefined,
        }))
      )
    }
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

  async verifyPlaceImages(images: readonly PlaceImage[], signal?: AbortSignal) {
    const warnings: PlaceSearchResponse["warnings"] = []
    if (!images.length) {
      warnings.push({
        provider: "periplus",
        code: "IMAGE_UNAVAILABLE",
        message: "当前地点没有可用图片",
      })
      return { images: [], warnings }
    }
    const available = (
      await Promise.all(
        images.map((image) => this.availableImage(image, warnings, signal))
      )
    ).filter((image): image is PlaceImage => Boolean(image))
    return { images: available, warnings }
  }

  private async callProvider(
    purpose: PlaceProviderPurpose,
    query: ReturnType<typeof normalizePlaceSearchInput>,
    usageContext?: PlaceProviderUsageContext
  ) {
    try {
      const circuitKey = usageContext?.agentRunId
      const now = this.retry.now?.() ?? Date.now()
      const circuitUntil = circuitKey
        ? this.providerCircuitUntil.get(circuitKey)
        : undefined
      if (circuitKey && circuitUntil && circuitUntil <= now) {
        this.providerCircuitUntil.delete(circuitKey)
      }
      if (circuitUntil && circuitUntil > now) {
        const result = {
          candidates: [],
          warnings: [
            {
              provider: "amap" as const,
              code: "quota_exceeded" as const,
              message: "当前 Agent run 的高德查询已因硬额度错误停止",
              retryable: false,
              attempts: 0,
              exhausted: true,
            },
          ],
          providerAttempts: 0,
        }
        if (usageContext) {
          await this.logUsage(purpose, "error", "quota_exceeded", usageContext)
        }
        return result
      }

      const retried = await queryWithRetry({
        operation: () => this.amapProvider.search(query, usageContext?.signal),
        failure: (result) => {
          const warning = providerFailureWarning(result.warnings)
          return warning
            ? {
                retryable:
                  warning.retryable === true &&
                  usageContext?.signal?.aborted !== true,
                rateLimited: warning.code === "rate_limited",
              }
            : undefined
        },
        sleep: this.retry.sleep,
        random: this.retry.random,
        signal: usageContext?.signal,
      })
      const failure = providerFailureWarning(retried.result.warnings)
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
      const terminalFailure = providerFailureWarning(result.warnings)
      if (
        circuitKey &&
        terminalFailure?.exhausted &&
        terminalFailure.retryable === false &&
        terminalFailure.code === "quota_exceeded"
      ) {
        this.openProviderCircuit(circuitKey, now + PROVIDER_CIRCUIT_TTL_MS)
      }
      if (usageContext) {
        await this.logUsage(
          purpose,
          terminalFailure ? "error" : "success",
          terminalFailure?.code,
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

  private async availableImage(
    image: PlaceImage,
    warnings: PlaceSearchResponse["warnings"],
    signal?: AbortSignal
  ): Promise<PlaceImage | undefined> {
    try {
      if (await this.imageProbe(image.url, signal)) return image
    } catch {
      if (signal?.aborted) {
        throw signal.reason ?? new DOMException("Aborted", "AbortError")
      }
      // Fall through to the same degradable image warning as a non-2xx response.
    }
    warnings.push({
      provider: image.provider,
      code: "IMAGE_UNAVAILABLE",
      message: "地点图片不可用",
      image,
    })
    return undefined
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
