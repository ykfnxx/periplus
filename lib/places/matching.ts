import type { PlaceSearchResult } from "./types"

export type ProviderMatchDecision =
  | {
      status: "AUTO_APPROVED" | "PENDING_REVIEW"
      candidate: PlaceSearchResult
      reason: string
    }
  | { status: "NO_MATCH"; reason: string }

const AUTO_APPROVE_CONFIDENCE = 0.88
const CLEAR_WINNER_MARGIN = 0.1

export function decideProviderMatch(
  candidates: PlaceSearchResult[]
): ProviderMatchDecision {
  const [first, second] = candidates
  if (!first) {
    return {
      status: "NO_MATCH",
      reason: "地图 provider 未返回候选地点",
    }
  }

  const margin = second ? first.confidence - second.confidence : 1
  if (
    first.confidence >= AUTO_APPROVE_CONFIDENCE &&
    margin >= CLEAR_WINNER_MARGIN
  ) {
    return {
      status: "AUTO_APPROVED",
      candidate: first,
      reason: `匹配置信度 ${first.confidence.toFixed(3)}，领先下一候选 ${margin.toFixed(3)}`,
    }
  }

  return {
    status: "PENDING_REVIEW",
    candidate: first,
    reason:
      first.confidence < AUTO_APPROVE_CONFIDENCE
        ? `匹配置信度 ${first.confidence.toFixed(3)} 低于自动通过阈值`
        : `前两名置信度差 ${margin.toFixed(3)}，无法确定唯一地点`,
  }
}
