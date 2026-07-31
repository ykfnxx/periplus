import { z } from "zod"
import {
  JOURNEY_EVENT_EXECUTION_STATUSES,
  JOURNEY_EVENT_ORIGINS,
  JOURNEY_SECTION_KINDS,
  TRANSIT_PREFERENCES,
  TRANSIT_REQUEST_MODES,
  TRANSPORT_MODES,
} from "@/types/journey"

const optionalId = z.string().min(1).optional()
const optionalDateTime = z.iso.datetime().optional()
const commandEnvelope = {
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(1).max(200),
}

const eventBase = {
  id: optionalId,
  parentEventId: optionalId,
  origin: z.enum(JOURNEY_EVENT_ORIGINS).default("AGENT_INSERTED"),
  title: z.string().min(1),
  description: z.string().optional(),
  plannedStartAt: optionalDateTime,
  plannedEndAt: optionalDateTime,
  actualStartAt: optionalDateTime,
  actualEndAt: optionalDateTime,
}

const executable = {
  executionStatus: z.enum(JOURNEY_EVENT_EXECUTION_STATUSES).default("PLANNED"),
}

const locationDetailSchema = z.object({
  plannedPlaceId: optionalId,
  actualPlaceId: optionalId,
  plannedLat: z.number().min(-90).max(90),
  plannedLng: z.number().min(-180).max(180),
  actualLat: z.number().min(-90).max(90).optional(),
  actualLng: z.number().min(-180).max(180).optional(),
  coordinateSystem: z.string().min(1).optional(),
  coordinateProvider: z.string().min(1).optional(),
  providerPlaceId: optionalId,
  plannedDurationMinutes: z.number().int().nonnegative().optional(),
  actualDurationMinutes: z.number().int().nonnegative().optional(),
})

const eventCreateSchema = z.discriminatedUnion("type", [
  z.object({
    ...eventBase,
    type: z.literal("SECTION"),
    detail: z.object({
      kind: z.enum(JOURNEY_SECTION_KINDS),
      placeId: optionalId,
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      coordinateSystem: z.string().min(1).optional(),
      coordinateProvider: z.string().min(1).optional(),
      providerPlaceId: optionalId,
    }),
  }),
  z.object({
    ...eventBase,
    ...executable,
    type: z.literal("VISIT"),
    detail: locationDetailSchema,
  }),
  z.object({
    ...eventBase,
    ...executable,
    type: z.literal("STAY"),
    detail: locationDetailSchema.extend({ checkInNote: z.string().optional() }),
  }),
  z.object({
    ...eventBase,
    ...executable,
    type: z.literal("MEAL"),
    detail: locationDetailSchema.extend({ cuisine: z.string().optional() }),
  }),
  z.object({
    ...eventBase,
    ...executable,
    type: z.literal("ACTIVITY"),
    detail: locationDetailSchema.extend({
      bookingReference: z.string().optional(),
    }),
  }),
  z.object({
    ...eventBase,
    ...executable,
    type: z.literal("TRANSIT"),
    detail: z.object({
      plannedFromEventId: optionalId,
      plannedToEventId: optionalId,
      transportMode: z.enum(TRANSPORT_MODES),
      requestMode: z.enum(TRANSIT_REQUEST_MODES).optional(),
      preference: z.enum(TRANSIT_PREFERENCES).optional(),
      plannedDepartAt: optionalDateTime,
      plannedDurationMinutes: z.number().int().nonnegative().optional(),
      plannedDistanceKm: z.number().nonnegative().optional(),
      plannedCostEstimate: z.number().nonnegative().optional(),
      notes: z.string().optional(),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal("NOTE"),
    detail: z.object({ body: z.string() }),
  }),
])

const positionSchema = z.discriminatedUnion("placement", [
  z.object({ placement: z.literal("start"), parentEventId: optionalId }),
  z.object({ placement: z.literal("end"), parentEventId: optionalId }),
  z.object({ placement: z.literal("before"), eventId: z.string().min(1) }),
  z.object({ placement: z.literal("after"), eventId: z.string().min(1) }),
  z.object({
    placement: z.literal("branch"),
    fromEventId: z.string().min(1),
    toEventId: optionalId,
    branchKey: optionalId,
  }),
])

export const getCurrentJourneyInputSchema = z.object({})

export const replaceJourneyInputSchema = z.object({
  ...commandEnvelope,
  journey: z.unknown().nullable(),
})

export const addJourneyEventInputSchema = z.object({
  ...commandEnvelope,
  event: eventCreateSchema,
  position: positionSchema,
})

export const moveJourneyEventInputSchema = z.object({
  ...commandEnvelope,
  eventId: z.string().min(1),
  position: positionSchema,
})

export const removeJourneyEventInputSchema = z.object({
  ...commandEnvelope,
  eventId: z.string().min(1),
  cascade: z.boolean().optional(),
})

export const updateJourneyEventInputSchema = z.object({
  ...commandEnvelope,
  eventId: z.string().min(1),
  patch: z
    .object({
      title: z.string().min(1).optional(),
      description: z.string().nullable().optional(),
      executionStatus: z.enum(JOURNEY_EVENT_EXECUTION_STATUSES).optional(),
      plannedStartAt: z.iso.datetime().nullable().optional(),
      plannedEndAt: z.iso.datetime().nullable().optional(),
      actualStartAt: z.iso.datetime().nullable().optional(),
      actualEndAt: z.iso.datetime().nullable().optional(),
      detail: z.record(z.string(), z.unknown()).optional(),
    })
    .refine((patch) => Object.keys(patch).length > 0, {
      message: "At least one patch field is required",
    }),
})

export const replaceJourneyEventInputSchema = z.object({
  ...commandEnvelope,
  eventId: z.string().min(1),
  replacement: eventCreateSchema,
})

export const linkPlaceInputSchema = z.object({
  ...commandEnvelope,
  eventId: z.string().min(1),
  place: z.object({
    placeId: optionalId,
    name: z.string().min(1),
    address: z.string().optional(),
    providerPlaceId: optionalId,
    coordinate: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      coordinateSystem: z.string().min(1),
      provider: z.string().min(1),
    }),
  }),
})

export const planTransitInputSchema = z.object({
  ...commandEnvelope,
  eventId: z.string().min(1),
})

export const selectTransitPlanInputSchema = planTransitInputSchema.extend({
  planId: z.string().min(1),
})

export const undoJourneyInputSchema = z.object({
  ...commandEnvelope,
  steps: z.number().int().positive().max(20).optional(),
})
