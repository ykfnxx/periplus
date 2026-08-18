import { z } from "zod"
import {
  TARGET_TRANSIT_PREFERENCES,
  TARGET_TRANSPORT_MODES,
  targetDateTimeSchema,
} from "@/modules/data-model/contracts"

const key = z.string().trim().min(1).max(80)
const text = z.string().trim().min(1)
const optionalText = text.optional()
const nullableText = text.nullable().optional()
const dateTime = targetDateTimeSchema

export const scheduleIntentSchema = z
  .object({
    dayIndex: z.number().int().positive().optional(),
    localDate: z.iso.date().optional(),
    timeWindow: z.enum(["MORNING", "AFTERNOON", "EVENING", "ANY"]).optional(),
    notBeforeLocalTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/u)
      .optional(),
    notAfterLocalTime: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/u)
      .optional(),
    durationMinutes: z
      .number()
      .int()
      .positive()
      .max(24 * 60)
      .optional(),
    flexibility: z.enum(["FIXED", "FLEXIBLE"]).optional(),
  })
  .strict()

export const placeSearchToolSchema = z
  .object({
    city: text,
    query: text,
    intent: z.enum(["VISIT", "MEAL", "ACTIVITY"]),
  })
  .strict()

export const hotelSearchToolSchema = z
  .object({
    stayRequirementId: key,
    preference: optionalText,
  })
  .strict()

export const routeSearchToolSchema = z
  .object({
    routeRequirementId: key,
    modePreference: z.enum(TARGET_TRANSPORT_MODES).optional(),
    routePreference: z.enum(TARGET_TRANSIT_PREFERENCES).optional(),
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

export const materializedPathEventSchema = z.discriminatedUnion("kind", [
  visitInputSchema,
  mealInputSchema,
  activityInputSchema,
  stayInputSchema,
  transitInputSchema,
])

const placeEventAddSchema = z
  .object({
    source: z.literal("PLACE"),
    selectionId: key,
    eventType: z.enum(["VISIT", "MEAL", "ACTIVITY"]),
    afterItemKey: key.nullable(),
    scheduleIntent: scheduleIntentSchema.optional(),
    notes: optionalText,
  })
  .strict()

const hotelEventAddSchema = z
  .object({
    source: z.literal("HOTEL"),
    stayRequirementId: key,
    selectionId: key,
    notes: optionalText,
  })
  .strict()

const routeEventAddSchema = z
  .object({
    source: z.literal("ROUTE"),
    routeRequirementId: key,
    selectionId: key,
    notes: optionalText,
  })
  .strict()

// Provider function schemas must have a root JSON Schema object. A Zod
// discriminated union serializes to a root `oneOf`, which OpenAI-compatible
// providers reject before the first model turn. Keep the provider-facing
// shape as one object and retain the exact source-specific variants in
// `agentToolRequestSchema` below for authoritative dispatch parsing.
export const eventAddToolSchema = z
  .object({
    source: z.enum(["PLACE", "HOTEL", "ROUTE"]),
    selectionId: key,
    eventType: z.enum(["VISIT", "MEAL", "ACTIVITY"]).optional(),
    afterItemKey: key.nullable().optional(),
    scheduleIntent: scheduleIntentSchema.optional(),
    stayRequirementId: key.optional(),
    routeRequirementId: key.optional(),
    notes: optionalText,
  })
  .strict()
  .superRefine((value, context) => {
    const requireField = (field: keyof typeof value, message: string) => {
      if (value[field] !== undefined) return
      context.addIssue({ code: "custom", path: [field], message })
    }
    const rejectField = (field: keyof typeof value, message: string) => {
      if (value[field] === undefined) return
      context.addIssue({ code: "custom", path: [field], message })
    }

    if (value.source === "PLACE") {
      requireField("eventType", "PLACE event.add requires eventType")
      requireField("afterItemKey", "PLACE event.add requires afterItemKey")
      rejectField(
        "stayRequirementId",
        "PLACE event.add does not accept stayRequirementId"
      )
      rejectField(
        "routeRequirementId",
        "PLACE event.add does not accept routeRequirementId"
      )
      return
    }

    rejectField(
      "eventType",
      `${value.source} event.add does not accept eventType`
    )
    rejectField(
      "afterItemKey",
      `${value.source} event.add does not accept afterItemKey`
    )
    rejectField(
      "scheduleIntent",
      `${value.source} event.add does not accept scheduleIntent`
    )

    if (value.source === "HOTEL") {
      requireField(
        "stayRequirementId",
        "HOTEL event.add requires stayRequirementId"
      )
      rejectField(
        "routeRequirementId",
        "HOTEL event.add does not accept routeRequirementId"
      )
      return
    }

    requireField(
      "routeRequirementId",
      "ROUTE event.add requires routeRequirementId"
    )
    rejectField(
      "stayRequirementId",
      "ROUTE event.add does not accept stayRequirementId"
    )
  })

export const eventUpdateToolSchema = z
  .object({
    itemKey: key,
    selectionId: key.optional(),
    eventType: z.enum(["VISIT", "MEAL", "ACTIVITY"]).optional(),
    scheduleIntent: scheduleIntentSchema.optional(),
    notes: nullableText,
  })
  .strict()
  .refine(
    (value) =>
      value.selectionId !== undefined ||
      value.eventType !== undefined ||
      value.scheduleIntent !== undefined ||
      value.notes !== undefined,
    { message: "event.update requires at least one semantic change" }
  )

export const eventMoveToolSchema = z
  .object({
    itemKey: key,
    afterItemKey: key.nullable(),
    scheduleIntent: scheduleIntentSchema.optional(),
  })
  .strict()

export const eventRemoveToolSchema = z
  .object({ itemKey: key, reason: text })
  .strict()

export const pathReadToolSchema = z.object({}).strict()

export const pathCommitToolSchema = z.object({}).strict()

export const agentToolRequestSchema = z.union([
  placeSearchToolSchema.extend({ type: z.literal("place.search") }),
  hotelSearchToolSchema.extend({ type: z.literal("hotel.search") }),
  routeSearchToolSchema.extend({ type: z.literal("route.search") }),
  pathReadToolSchema.extend({ type: z.literal("path.read") }),
  placeEventAddSchema.extend({ type: z.literal("event.add") }),
  hotelEventAddSchema.extend({ type: z.literal("event.add") }),
  routeEventAddSchema.extend({ type: z.literal("event.add") }),
  eventUpdateToolSchema.extend({ type: z.literal("event.update") }),
  eventMoveToolSchema.extend({ type: z.literal("event.move") }),
  eventRemoveToolSchema.extend({ type: z.literal("event.remove") }),
  pathCommitToolSchema.extend({ type: z.literal("path.commit") }),
])

export type AgentToolRequest = z.input<typeof agentToolRequestSchema>
export type ParsedAgentToolRequest = z.output<typeof agentToolRequestSchema>
export type MaterializedPathEvent = z.output<typeof materializedPathEventSchema>
export type ScheduleIntent = z.output<typeof scheduleIntentSchema>

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
