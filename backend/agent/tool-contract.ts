import { z } from "zod"
import {
  TARGET_TRANSIT_PREFERENCES,
  TARGET_TRANSPORT_MODES,
} from "@/modules/data-model/contracts"

const id = z.string().trim().min(1)
const optionalText = z.string().trim().min(1).optional()
const nullableText = z.string().trim().min(1).nullable().optional()
const dateTime = z.iso.datetime({ offset: true })

const issueReference = { issueId: id.optional() }
const orderedInsertion = { afterCardId: id.nullable().optional() }

export const draftOpenToolSchema = z.object({}).strict()

export const cityAddToolSchema = z
  .object({
    name: z.string().trim().min(1),
    description: optionalText,
    ...orderedInsertion,
    ...issueReference,
  })
  .strict()

export const placeResolveToolSchema = z
  .object({
    cityCardId: id,
    cardType: z.enum(["VISIT", "MEAL", "ACTIVITY"]),
    query: z.string().trim().min(1),
    origin: z.enum(["USER_EXPLICIT", "PLANNER_CHOICE"]),
  })
  .strict()

export const placeEventAddToolSchema = z
  .object({
    cityCardId: id,
    cardType: z.enum(["VISIT", "MEAL", "ACTIVITY"]),
    placeResolutionId: id,
    plannedStartAt: dateTime,
    plannedEndAt: dateTime.optional(),
    plannedDurationMinutes: z.number().int().positive().optional(),
    description: optionalText,
    cuisine: optionalText,
    bookingReference: optionalText,
    ...orderedInsertion,
    ...issueReference,
  })
  .strict()

export const hotelSearchToolSchema = z
  .object({
    cityCardId: id,
    preference: optionalText,
  })
  .strict()

export const stayAddToolSchema = z
  .object({
    cityCardId: id,
    hotelSelectionId: id,
    description: optionalText,
    checkInNote: optionalText,
    ...orderedInsertion,
    ...issueReference,
  })
  .strict()

export const transitAddToolSchema = z
  .object({
    fromCardId: id,
    toCardId: id,
    plannedStartAt: dateTime.optional(),
    plannedEndAt: dateTime.optional(),
    modePreference: z.enum(TARGET_TRANSPORT_MODES).optional(),
    routePreference: z.enum(TARGET_TRANSIT_PREFERENCES).optional(),
    title: optionalText,
    description: optionalText,
    notes: optionalText,
    ...issueReference,
  })
  .strict()

const scheduleChanges = {
  plannedStartAt: dateTime.nullable().optional(),
  plannedEndAt: dateTime.nullable().optional(),
}

export const cardChangesSchema = z
  .discriminatedUnion("type", [
    z
      .object({
        type: z.literal("CITY"),
        title: optionalText,
        description: nullableText,
      })
      .strict(),
    z
      .object({
        type: z.literal("VISIT"),
        ...scheduleChanges,
        description: nullableText,
        plannedDurationMinutes: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("MEAL"),
        ...scheduleChanges,
        description: nullableText,
        plannedDurationMinutes: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional(),
        cuisine: nullableText,
      })
      .strict(),
    z
      .object({
        type: z.literal("ACTIVITY"),
        ...scheduleChanges,
        description: nullableText,
        plannedDurationMinutes: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional(),
        bookingReference: nullableText,
      })
      .strict(),
    z
      .object({
        type: z.literal("STAY"),
        ...scheduleChanges,
        description: nullableText,
        checkInNote: nullableText,
      })
      .strict(),
    z
      .object({
        type: z.literal("TRANSIT"),
        ...scheduleChanges,
        title: optionalText,
        description: nullableText,
        modePreference: z.enum(TARGET_TRANSPORT_MODES).optional(),
        routePreference: z.enum(TARGET_TRANSIT_PREFERENCES).optional(),
        notes: nullableText,
      })
      .strict(),
    z
      .object({
        type: z.literal("NOTE"),
        title: optionalText,
        description: nullableText,
      })
      .strict(),
  ])
  .refine((changes) => Object.keys(changes).length > 1, {
    message: "card.update requires at least one business field",
  })

export const cardUpdateToolSchema = z
  .object({ cardId: id, changes: cardChangesSchema, ...issueReference })
  .strict()

export const cardMoveToolSchema = z
  .object({
    cardId: id,
    afterCardId: id.nullable(),
    ...issueReference,
  })
  .strict()

export const cardRemoveToolSchema = z
  .object({
    cardId: id,
    removeCityChildren: z.boolean().optional(),
    ...issueReference,
  })
  .strict()

export const draftProjectToolSchema = z
  .object({ scopeCityCardId: id.nullable().optional() })
  .strict()
export const draftValidateToolSchema = z.object({}).strict()
export const draftPrepareTransitToolSchema = z
  .object({ transitCardId: id })
  .strict()
export const draftCommitToolSchema = z.object({}).strict()

export const agentToolRequestSchema = z.discriminatedUnion("type", [
  draftOpenToolSchema.extend({ type: z.literal("draft.open") }),
  cityAddToolSchema.extend({ type: z.literal("city.add") }),
  placeResolveToolSchema.extend({ type: z.literal("place.resolve") }),
  placeEventAddToolSchema.extend({ type: z.literal("placeEvent.add") }),
  hotelSearchToolSchema.extend({ type: z.literal("hotel.search") }),
  stayAddToolSchema.extend({ type: z.literal("stay.add") }),
  transitAddToolSchema.extend({ type: z.literal("transit.add") }),
  cardUpdateToolSchema.extend({ type: z.literal("card.update") }),
  cardMoveToolSchema.extend({ type: z.literal("card.move") }),
  cardRemoveToolSchema.extend({ type: z.literal("card.remove") }),
  draftProjectToolSchema.extend({ type: z.literal("draft.project") }),
  draftValidateToolSchema.extend({ type: z.literal("draft.validate") }),
  draftPrepareTransitToolSchema.extend({
    type: z.literal("draft.prepare_transit"),
  }),
  draftCommitToolSchema.extend({ type: z.literal("draft.commit") }),
])

export type AgentToolRequest = z.input<typeof agentToolRequestSchema>
export type ParsedAgentToolRequest = z.output<typeof agentToolRequestSchema>

export type AgentToolResult<T = unknown> =
  | { status: "ok"; data: T }
  | {
      status: "retryable_error"
      code: string
      message: string
      details?: unknown
    }
  | {
      status: "terminal_error"
      code: string
      message: string
      details?: unknown
    }

export const ok = <T>(data: T): AgentToolResult<T> => ({ status: "ok", data })

export const retryableError = (
  code: string,
  message: string,
  details?: unknown
): AgentToolResult => ({
  status: "retryable_error",
  code,
  message,
  ...(details === undefined ? {} : { details }),
})

export const terminalError = (
  code: string,
  message: string,
  details?: unknown
): AgentToolResult => ({
  status: "terminal_error",
  code,
  message,
  ...(details === undefined ? {} : { details }),
})
