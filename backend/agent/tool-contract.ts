import { z } from "zod"
import {
  TARGET_TRANSIT_PREFERENCES,
  TARGET_TRANSPORT_MODES,
} from "@/modules/data-model/contracts"

const key = z.string().trim().min(1).max(80)
const text = z.string().trim().min(1)
const optionalText = text.optional()
const nullableText = text.nullable().optional()
const dateTime = z.iso.datetime({ offset: true })

export const placeResolveToolSchema = z
  .object({
    proposalItemKey: key,
    cityQuery: text,
    query: text,
    kind: z.enum(["VISIT", "MEAL", "ACTIVITY"]),
    origin: z.enum(["USER_EXPLICIT", "PLANNER_CHOICE"]),
  })
  .strict()

export const hotelSearchToolSchema = z
  .object({
    proposalItemKey: key,
    cityQuery: text,
    checkInDate: z.iso.date(),
    stayNights: z.number().int().positive().max(30),
    adultCount: z.number().int().positive().max(10),
    preference: optionalText,
  })
  .strict()

export const routeResolveToolSchema = z
  .object({
    proposalItemKey: key,
    fromItemKey: key,
    toItemKey: key,
    transportMode: z.enum(TARGET_TRANSPORT_MODES).optional(),
    preference: z.enum(TARGET_TRANSIT_PREFERENCES).optional(),
  })
  .strict()

const locationSchedule = {
  plannedStartAt: dateTime,
  plannedEndAt: dateTime.optional(),
}

const commonEvent = {
  proposalItemKey: key,
  title: text,
  description: optionalText,
}

const visitInputSchema = z
  .object({
    ...commonEvent,
    ...locationSchedule,
    kind: z.literal("VISIT"),
    cityQuery: text,
    plannedDurationMinutes: z.number().int().positive().optional(),
  })
  .strict()

const mealInputSchema = z
  .object({
    ...commonEvent,
    ...locationSchedule,
    kind: z.literal("MEAL"),
    cityQuery: text,
    plannedDurationMinutes: z.number().int().positive().optional(),
    cuisine: optionalText,
  })
  .strict()

const activityInputSchema = z
  .object({
    ...commonEvent,
    ...locationSchedule,
    kind: z.literal("ACTIVITY"),
    cityQuery: text,
    plannedDurationMinutes: z.number().int().positive().optional(),
    bookingReference: optionalText,
  })
  .strict()

const stayInputSchema = z
  .object({
    ...commonEvent,
    ...locationSchedule,
    kind: z.literal("STAY"),
    cityQuery: text,
    checkInNote: optionalText,
  })
  .strict()

const transitInputSchema = z
  .object({
    ...commonEvent,
    kind: z.literal("TRANSIT"),
    plannedStartAt: dateTime.optional(),
    plannedEndAt: dateTime.optional(),
    fromItemKey: key,
    toItemKey: key,
    transportMode: z.enum(TARGET_TRANSPORT_MODES),
    preference: z.enum(TARGET_TRANSIT_PREFERENCES).optional(),
    notes: optionalText,
  })
  .strict()

export const pathEventInputSchema = z.discriminatedUnion("kind", [
  visitInputSchema,
  mealInputSchema,
  activityInputSchema,
  stayInputSchema,
  transitInputSchema,
])

export const pathAppendEventToolSchema = z
  .object({
    event: pathEventInputSchema,
    afterItemKey: key.nullable(),
    reason: text,
  })
  .strict()

export const pathReplaceEventToolSchema = z
  .object({ itemKey: key, event: pathEventInputSchema, reason: text })
  .strict()

export const pathRemoveEventToolSchema = z
  .object({ itemKey: key, reason: text })
  .strict()

export const pathValidateToolSchema = z.object({}).strict()
export const pathCommitToolSchema = z.object({}).strict()

export const agentToolRequestSchema = z.discriminatedUnion("type", [
  placeResolveToolSchema.extend({ type: z.literal("place.resolve") }),
  hotelSearchToolSchema.extend({ type: z.literal("hotel.search") }),
  routeResolveToolSchema.extend({ type: z.literal("route.resolve") }),
  pathAppendEventToolSchema.extend({ type: z.literal("path.append_event") }),
  pathReplaceEventToolSchema.extend({
    type: z.literal("path.replace_event"),
  }),
  pathRemoveEventToolSchema.extend({ type: z.literal("path.remove_event") }),
  pathValidateToolSchema.extend({ type: z.literal("path.validate") }),
  pathCommitToolSchema.extend({ type: z.literal("path.commit") }),
])

export type AgentToolRequest = z.input<typeof agentToolRequestSchema>
export type ParsedAgentToolRequest = z.output<typeof agentToolRequestSchema>
export type PathEventInput = z.output<typeof pathEventInputSchema>

export interface AgentToolFieldError {
  field: string
  reason: string
}

export interface AgentToolResultContext {
  received?: Record<string, unknown>
  fieldErrors?: AgentToolFieldError[]
  stateDelta?: unknown
  planningState?: unknown
  allowedNextAction?: string
  remainingBudget?: number
}

export type AgentToolResult<T = unknown> =
  | {
      status: "ok"
      data: T
      stateDelta?: unknown
      planningState?: unknown
      allowedNextAction: string
    }
  | {
      status: "retryable_error"
      code: string
      message: string
      details?: unknown
      received: Record<string, unknown>
      fieldErrors?: AgentToolFieldError[]
      planningState?: unknown
      allowedNextAction: string
      remainingBudget?: number
    }
  | {
      status: "non_retryable_error"
      code: string
      message: string
      details?: unknown
      received?: Record<string, unknown>
      planningState?: unknown
      allowedNextAction: "STOP"
    }

export const ok = <T>(
  data: T,
  context: AgentToolResultContext = {}
): AgentToolResult<T> => ({
  status: "ok",
  data,
  ...(context.stateDelta === undefined
    ? {}
    : { stateDelta: context.stateDelta }),
  ...(context.planningState === undefined
    ? {}
    : { planningState: context.planningState }),
  allowedNextAction: context.allowedNextAction ?? "CONTINUE",
})

export const retryableError = (
  code: string,
  message: string,
  details?: unknown,
  context: AgentToolResultContext = {}
): AgentToolResult => ({
  status: "retryable_error",
  code,
  message,
  ...(details === undefined ? {} : { details }),
  received: context.received ?? {},
  ...(context.fieldErrors === undefined
    ? {}
    : { fieldErrors: context.fieldErrors }),
  ...(context.planningState === undefined
    ? {}
    : { planningState: context.planningState }),
  allowedNextAction: context.allowedNextAction ?? "RETRY_THIS_TOOL",
  ...(context.remainingBudget === undefined
    ? {}
    : { remainingBudget: context.remainingBudget }),
})

export const nonRetryableError = (
  code: string,
  message: string,
  details?: unknown,
  context: AgentToolResultContext = {}
): AgentToolResult => ({
  status: "non_retryable_error",
  code,
  message,
  ...(details === undefined ? {} : { details }),
  ...(context.received === undefined ? {} : { received: context.received }),
  ...(context.planningState === undefined
    ? {}
    : { planningState: context.planningState }),
  allowedNextAction: "STOP",
})

// The graph compiler still consumes the old command shapes internally while the
// Agent-facing catalog is cut over. These types are not registered with Pi Core.
export type LegacyParsedAgentToolRequest =
  | {
      type: "city.add"
      name: string
      description?: string
      afterCardId?: string | null
      issueId?: string
    }
  | {
      type: "placeEvent.add"
      cityCardId: string
      cardType: "VISIT" | "MEAL" | "ACTIVITY"
      placeResolutionId: string
      plannedStartAt: string
      plannedEndAt?: string
      plannedDurationMinutes?: number
      description?: string
      cuisine?: string
      bookingReference?: string
      afterCardId?: string | null
      issueId?: string
    }
  | {
      type: "stay.add"
      cityCardId: string
      hotelSelectionId: string
      description?: string
      checkInNote?: string
      afterCardId?: string | null
      issueId?: string
    }
  | {
      type: "transit.add"
      fromCardId: string
      toCardId: string
      plannedStartAt?: string
      plannedEndAt?: string
      modePreference?: (typeof TARGET_TRANSPORT_MODES)[number]
      routePreference?: (typeof TARGET_TRANSIT_PREFERENCES)[number]
      title?: string
      description?: string
      notes?: string
      issueId?: string
    }
  | {
      type: "card.move"
      cardId: string
      afterCardId: string | null
      issueId?: string
    }
  | {
      type: "card.remove"
      cardId: string
      removeCityChildren?: boolean
      issueId?: string
    }
  | {
      type: "card.update"
      cardId: string
      issueId?: string
      changes:
        | {
            type: "CITY"
            title?: string
            description?: string | null
          }
        | {
            type: "VISIT"
            plannedStartAt?: string | null
            plannedEndAt?: string | null
            description?: string | null
            plannedDurationMinutes?: number | null
          }
        | {
            type: "MEAL"
            plannedStartAt?: string | null
            plannedEndAt?: string | null
            description?: string | null
            plannedDurationMinutes?: number | null
            cuisine?: string | null
          }
        | {
            type: "ACTIVITY"
            plannedStartAt?: string | null
            plannedEndAt?: string | null
            description?: string | null
            plannedDurationMinutes?: number | null
            bookingReference?: string | null
          }
        | {
            type: "STAY"
            plannedStartAt?: string | null
            plannedEndAt?: string | null
            description?: string | null
            checkInNote?: string | null
          }
        | {
            type: "TRANSIT"
            plannedStartAt?: string | null
            plannedEndAt?: string | null
            title?: string
            description?: string | null
            modePreference?: (typeof TARGET_TRANSPORT_MODES)[number]
            routePreference?: (typeof TARGET_TRANSIT_PREFERENCES)[number]
            notes?: string | null
          }
        | { type: "NOTE"; title?: string; description?: string | null }
    }

export const legacyNullableText = nullableText
