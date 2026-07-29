import type { RouteSegmentMode, TransportMode } from "@/types/route"

// 与 app/globals.css @theme 中的 --color-* token 一一对应，改色需双改
export const periplusColors = {
  cream: "#f5e6d3",
  softWhite: "#fffaf3",
  white: "#fff",
  ink: "#2c2416",
  russet: "#a94f2b",
  mustard: "#d4a574",
  olive: "#4a7c59",
  walnut: "#6b5d4f",
  teak: "#765f45",
  bluegray: "#4f6d79",
  coral: "#a84643",
  routeBlue: "#5fb7ff",
  routeBluePending: "#9dd8ff",
} as const

export const routeMarkerColors = [
  periplusColors.russet,
  periplusColors.olive,
  periplusColors.mustard,
  periplusColors.bluegray,
  periplusColors.coral,
  "#7c6f64",
] as const

export interface TransportEdgeStyle {
  color: string
  strokeStyle: "solid" | "dashed"
  dasharray?: number[]
}

export const defaultTransportEdgeStyle: TransportEdgeStyle = {
  color: periplusColors.routeBlue,
  strokeStyle: "solid",
}

// CAR / TAXI / RENTAL 走默认样式（routeBlue 实线）
export const transportEdgeStyles: Partial<
  Record<TransportMode, TransportEdgeStyle>
> = {
  FLIGHT: { color: "#a78bfa", strokeStyle: "dashed", dasharray: [10, 8] },
  TRAIN: { color: "#48c9a9", strokeStyle: "solid" },
  SUBWAY: { color: periplusColors.coral, strokeStyle: "solid" },
  BUS: { color: "#f0b45c", strokeStyle: "solid" },
  WALK: { color: "#7fb069", strokeStyle: "dashed", dasharray: [4, 8] },
}

export function getTransportEdgeStyle(
  transportMode?: TransportMode
): TransportEdgeStyle {
  return (
    (transportMode && transportEdgeStyles[transportMode]) ||
    defaultTransportEdgeStyle
  )
}

export function getRouteSegmentStyle(mode: RouteSegmentMode) {
  const transportMode: Partial<Record<RouteSegmentMode, TransportMode>> = {
    WALK: "WALK",
    DRIVE: "CAR",
    BUS: "BUS",
    SUBWAY: "SUBWAY",
    RAIL: "TRAIN",
    TAXI: "TAXI",
    FLIGHT: "FLIGHT",
  }
  return getTransportEdgeStyle(transportMode[mode])
}

export const trafficSectionColors = {
  UNKNOWN: periplusColors.bluegray,
  FREE_FLOW: "#36a269",
  SLOW: "#e8b04f",
  CONGESTED: "#e26952",
  SEVERE: "#a83f46",
} as const
