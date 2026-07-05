import type {
  LocalSearchResult,
  NormalizedPlaceQuery,
  ProviderPlan,
} from "./types"

const LIVE_SEARCH_CONFIDENCE_THRESHOLD = 0.82

export function planPlaceProviderSearch(
  query: NormalizedPlaceQuery,
  local: LocalSearchResult
): ProviderPlan {
  const hasLiveIntent = Boolean(query.near || query.radiusMeters)
  const hasEnoughLocal =
    local.candidates.length >= query.limit &&
    local.topConfidence >= LIVE_SEARCH_CONFIDENCE_THRESHOLD

  if (!query.query && !query.near) {
    return {
      useAmap: false,
      writeBack: "none",
      reason: "查询缺少关键词或附近坐标",
    }
  }

  if (!query.includeLiveProvider && hasEnoughLocal && !hasLiveIntent) {
    return {
      useAmap: false,
      writeBack: "none",
      reason: "本地地点库已有足够高置信结果",
    }
  }

  return {
    useAmap: true,
    writeBack: "cache_only",
    reason: query.includeLiveProvider
      ? "调用方要求实时 provider 查询"
      : "本地结果不足或需要附近查询",
  }
}
