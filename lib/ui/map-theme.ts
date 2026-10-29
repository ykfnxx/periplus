import type { JourneyEvent } from "@/modules/data-model/contracts"

type TransportMode = NonNullable<JourneyEvent["transit"]>["transportMode"]
type TransitSegmentMode = NonNullable<
  NonNullable<JourneyEvent["transit"]>["route"]
>["plans"][number]["segments"][number]["mode"]

// 与 app/globals.css @theme 中的 --color-* token 一一对应，改色需双改
export const periplusColors = {
  cream: "#f5e6d3",
  softWhite: "#fffaf3",
  white: "#fff",
  ink: "#2c2416",
  russet: "#d97642",
  mustard: "#d4a574",
  olive: "#4a7c59",
  walnut: "#6b5d4f",
  teak: "#765f45",
  bluegray: "#4f6d79",
  coral: "#a84643",
  routeBlue: "#5fb7ff",
  journalPaper: "#faf6ee",
  journalPaperLine: "#e6d8c6",
  journalPaperSoft: "#f3eadb",
  journalPaperMuted: "#756b5c",
  journalAmber: "#a45a12",
} as const

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

export function getRouteSegmentStyle(mode: TransitSegmentMode) {
  const transportMode: Partial<Record<TransitSegmentMode, TransportMode>> = {
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
