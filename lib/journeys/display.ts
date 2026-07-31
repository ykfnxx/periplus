import type { TransitSegmentMode } from "@/types/journey"

export function formatTransitDuration(seconds: number) {
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return `${minutes} 分钟`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`
}

export function formatTransitDistance(meters: number) {
  if (meters < 1_000) return `${Math.round(meters)} 米`
  return `${(meters / 1_000).toFixed(meters < 10_000 ? 1 : 0)} 公里`
}

export function transitModeLabel(mode: TransitSegmentMode) {
  const labels: Record<TransitSegmentMode, string> = {
    WALK: "步行",
    DRIVE: "驾车",
    BUS: "公交",
    SUBWAY: "地铁",
    RAIL: "火车",
    TAXI: "出租车",
    FLIGHT: "飞机",
  }
  return labels[mode]
}
