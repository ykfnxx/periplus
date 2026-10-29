export const TARGET_JOURNEY_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED"] as const

export const TARGET_JOURNEY_VISIBILITIES = [
  "PRIVATE",
  "UNLISTED",
  "PUBLIC",
] as const

export const TARGET_EVENT_EXECUTION_STATUSES = [
  "PLANNED",
  "STARTED",
  "CONFIRMED",
  "SKIPPED",
  "CANCELLED",
] as const

export const TARGET_TRANSIT_REQUEST_MODES = [
  "DRIVE",
  "WALK",
  "TRANSIT",
] as const

export const TARGET_TRANSIT_PREFERENCES = [
  "RECOMMENDED",
  "FASTEST",
  "LOW_COST",
  "FEWER_TRANSFERS",
  "LESS_WALKING",
] as const

export const TARGET_TRANSPORT_MODES = [
  "FLIGHT",
  "TRAIN",
  "CAR",
  "BUS",
  "WALK",
  "TAXI",
  "SUBWAY",
  "RENTAL",
] as const

export const TARGET_TRANSIT_SEGMENT_MODES = [
  "WALK",
  "DRIVE",
  "BUS",
  "SUBWAY",
  "RAIL",
  "TAXI",
  "FLIGHT",
] as const

export const TARGET_COORDINATE_SYSTEMS = [
  "WGS84",
  "GCJ02",
  "BD09",
  "LOCAL",
] as const

export const TARGET_GEOMETRY_KINDS = [
  "ROAD_NETWORK",
  "TRANSIT_LINE",
  "SCHEMATIC",
  "NONE",
] as const

export const TARGET_TRAFFIC_BASES = [
  "REALTIME",
  "PREDICTED",
  "TYPICAL",
  "SCHEDULED",
  "UNKNOWN",
] as const

export const TARGET_ASSET_KINDS = ["IMAGE", "VIDEO", "AUDIO", "FILE"] as const
