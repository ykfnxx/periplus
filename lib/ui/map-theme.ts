import type { JourneyEvent } from "@/modules/data-model/contracts"

type TransportMode = NonNullable<JourneyEvent["transit"]>["transportMode"]
type TransitSegmentMode = NonNullable<
  NonNullable<JourneyEvent["transit"]>["route"]
>["plans"][number]["segments"][number]["mode"]

// 与 styles/theme.css @theme 中的 --color-* token 一一对应，改色需双改
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
  mapLand: "#dfe6e3",
  mapMarker: "#984527",
  mapRoute: "#9f4308",
  routeBlue: "#5fb7ff",
  journalCanvas: "#faf8f3",
  journalCanvasRecess: "#eee9df",
  journalCanvasLine: "#d8d1c4",
  journalCard: "#fff",
  journalChip: "#f3efe6",
  journalPaper: "#fff",
  journalPaperLine: "#e7e1d6",
  journalPaperSoft: "#f5f2eb",
  journalPaperMuted: "#696258",
  journalInk: "#1f1c18",
  journalAmber: "#984527",
  journalTag: "#f3efe6",
  journalTagLine: "#e7e1d6",
  journalTagInk: "#1f1c18",
  journalTransit: "#ecf4f9",
  journalTransitLine: "#cbe0ee",
  journalTransitChip: "#f7fbfd",
  journalTransitChipLine: "#cbe0ee",
  journalTransitInk: "#1e3240",
  journalTransitMuted: "#587285",
  journalTransitNote: "#3b5568",
  journalTransitAccent: "#2d6284",
  journalTransitSelected: "#2d6284",
  photoStage: "#141210",
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
