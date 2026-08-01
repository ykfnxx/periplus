export const TARGET_JOURNEY_STATUSES = ["DRAFT", "ACTIVE", "COMPLETED"] as const

export const TARGET_JOURNEY_VISIBILITIES = [
  "PRIVATE",
  "UNLISTED",
  "PUBLIC",
] as const

export const TARGET_EVENT_TYPES = [
  "SECTION",
  "VISIT",
  "TRANSIT",
  "STAY",
  "MEAL",
  "ACTIVITY",
  "NOTE",
] as const

export const TARGET_EVENT_EXECUTION_STATUSES = [
  "PLANNED",
  "STARTED",
  "CONFIRMED",
  "SKIPPED",
  "CANCELLED",
] as const

export const TARGET_EVENT_ORIGINS = [
  "ORIGINAL",
  "USER_INSERTED",
  "AGENT_INSERTED",
  "FORKED",
  "SOURCE_DERIVED",
] as const

export const TARGET_EVENT_PLACEMENT_STATUSES = [
  "SCHEDULED",
  "UNSCHEDULED",
] as const

export const TARGET_LINK_KINDS = ["MAIN", "ALTERNATIVE"] as const

export const TARGET_SECTION_KINDS = ["CITY", "DAY", "THEME"] as const

export const TARGET_ACTOR_KINDS = ["USER", "AGENT", "SYSTEM"] as const

export const TARGET_PROJECTION_MODES = [
  "PLANNER",
  "EXECUTION",
  "TRAVELOGUE",
] as const

export const TARGET_VALUE_SOURCES = ["PLANNED", "ACTUAL", "DERIVED"] as const

export const TARGET_TRANSIT_RUN_STATUSES = [
  "PLANNING",
  "READY",
  "FAILED",
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

export const TARGET_WORKSPACE_STATUSES = [
  "ACTIVE",
  "EXPIRED",
  "ARCHIVED",
] as const

export const TARGET_WORKSPACE_ACCESS_STATES = [
  "OWNER",
  "NO_ACCESS",
  "EXPIRED",
  "REAUTH_REQUIRED",
] as const

export const TARGET_WORKSPACE_DRAFT_STATES = [
  "CLEAN",
  "DIRTY",
  "SAVING",
  "STALE",
  "CONFLICT",
] as const

export const TARGET_AGENT_RUN_STATUSES = [
  "RUNNING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
] as const

export const TARGET_ASSET_KINDS = ["IMAGE", "VIDEO", "AUDIO", "FILE"] as const

export const TARGET_ASSET_VISIBILITIES = [
  "PRIVATE",
  "JOURNEY",
  "PUBLIC",
] as const

export const TARGET_EVENT_ASSET_ROLES = [
  "COVER",
  "GALLERY",
  "RECEIPT",
  "REFERENCE",
] as const

export const TARGET_OBSERVATION_KINDS = [
  "NOTE",
  "RATING",
  "COST",
  "WEATHER",
  "FACT",
] as const

export const TARGET_OBSERVATION_PHASES = ["PLANNED", "ACTUAL"] as const

export const TARGET_SOURCE_PACK_VISIBILITIES = ["PRIVATE", "SHARED"] as const

export const TARGET_SOURCE_PACK_STATUSES = [
  "DRAFT",
  "PROCESSING",
  "READY",
  "FAILED",
  "ARCHIVED",
] as const

export const TARGET_SOURCE_ITEM_RESOLUTION_STATES = [
  "UNRESOLVED",
  "CANDIDATE",
  "CONFIRMED",
  "REJECTED",
] as const

export const TARGET_EVENT_SOURCE_ROLES = [
  "INSPIRATION",
  "EVIDENCE",
  "NAVIGATION",
] as const

export const TARGET_COMMAND_NAMES = [
  "journey.add_event",
  "journey.update_event",
  "journey.move_event",
  "journey.place_event",
  "journey.retire_event",
  "journey.replace_event",
  "journey.add_link",
  "journey.retire_link",
  "journey.select_branch",
  "journey.plan_transit",
  "journey.select_transit_plan",
  "journey.confirm_actual",
  "journey.skip_event",
  "journey.cancel_event",
  "journey.attach_asset",
  "journey.add_observation",
  "journey.link_source_item",
  "journey.undo",
  "workspace.replay",
  "workspace.fork",
  "workspace.commit",
] as const

export type TargetProjectionMode = (typeof TARGET_PROJECTION_MODES)[number]
export type TargetCommandName = (typeof TARGET_COMMAND_NAMES)[number]
