import { z } from "zod"
import { targetIdSchema as id, targetDateTimeSchema as instant } from "./common"
import {
  eventContentSchema,
  eventDateSchema,
  eventLocationSchema,
  eventPlanningSchema,
  MAX_PHOTO_CAPTION_LENGTH,
} from "./event"
import { receiptInputSchema, receiptFieldsSchema } from "./receipts"
import { journeySnapshotSchema } from "./journey"
import {
  TARGET_EVENT_EXECUTION_STATUSES,
  TARGET_TRANSPORT_MODES,
  TARGET_TRANSIT_REQUEST_MODES,
  TARGET_TRANSIT_PREFERENCES,
} from "./enums"

export const eventInputSchema = eventContentSchema
  .partial()
  .extend({
    planning: eventPlanningSchema
      .pick({ startAt: true, endAt: true, durationMinutes: true })
      .extend({
        startAt: instant.nullable().optional(),
        endAt: instant.nullable().optional(),
      })
      .nullable()
      .optional(),
    hotel: z
      .object({ checkInNote: z.string().nullable().optional() })
      .strict()
      .nullable()
      .optional(),
    transit: z
      .object({
        fromName: z.string().trim().min(1).max(300).optional(),
        toName: z.string().trim().min(1).max(300).optional(),
        fromEventId: id.optional(),
        toEventId: id.optional(),
        transportMode: z.enum(TARGET_TRANSPORT_MODES).optional(),
        distanceMeters: z.number().finite().nonnegative().nullable().optional(),
        requestMode: z.enum(TARGET_TRANSIT_REQUEST_MODES).optional(),
        preference: z.enum(TARGET_TRANSIT_PREFERENCES).optional(),
        notes: z.string().optional(),
      })
      .strict()
      .nullable()
      .optional(),
    cuisine: z.string().nullable().optional(),
    bookingReference: z.string().nullable().optional(),
    executionStatus: z.enum(TARGET_EVENT_EXECUTION_STATUSES).optional(),
    actualStartAt: instant.optional(),
    actualEndAt: instant.optional(),
  })
  .strict()
const eventInput = eventInputSchema
const eventPatch = eventInput.refine(
  (value) => Object.keys(value).length > 0,
  "At least one field must be supplied"
)

export const journeyCommandSchema = z.discriminatedUnion("name", [
  z
    .object({
      name: z.literal("journey.update"),
      patch: z
        .object({
          title: z.string().trim().min(1).max(200).optional(),
          description: z.string().max(10_000).optional(),
          status: z.enum(["DRAFT", "ACTIVE", "COMPLETED"]).optional(),
        })
        .strict()
        .refine((value) => Object.keys(value).length > 0),
    })
    .strict(),
  z
    .object({
      name: z.literal("event.add"),
      // null inserts at the beginning; an ID inserts immediately after it.
      afterEventId: id.nullable(),
      content: eventInput.extend({ date: eventDateSchema }),
      receipt: receiptInputSchema.optional(),
    })
    .strict(),
  z
    .object({
      name: z.literal("event.update"),
      eventId: id,
      patch: eventPatch,
    })
    .strict(),
  z
    .object({
      name: z.literal("event.move"),
      eventId: id,
      afterEventId: id.nullable(),
    })
    .strict(),
  z
    .object({
      name: z.literal("event.remove"),
      eventId: id,
    })
    .strict(),
  z
    .object({
      name: z.literal("photos.set"),
      eventId: id,
      // This is the complete ordered membership for ONE event. Uploading an
      // Asset alone does not attach it; omitting it here detaches, never deletes.
      photos: z
        .array(
          z
            .object({
              assetId: id,
              caption: z.string().max(5000),
            })
            .strict()
        )
        .max(100),
      coverAssetId: id.nullable(),
    })
    .strict(),
  z
    .object({
      name: z.literal("receipt.add"),
      eventId: id,
      receipt: receiptInputSchema,
    })
    .strict(),
  z
    .object({
      name: z.literal("receipt.update"),
      eventId: id,
      receiptId: id,
      fields: receiptFieldsSchema,
    })
    .strict(),
  z
    .object({
      name: z.literal("receipt.remove"),
      eventId: id,
      receiptId: id,
    })
    .strict(),
  z
    .object({
      name: z.literal("photo.update"),
      eventId: id,
      assetId: id,
      patch: z
        .object({
          caption: z.string().max(MAX_PHOTO_CAPTION_LENGTH).optional(),
          location: eventLocationSchema.nullable().optional(),
        })
        .strict()
        .refine(
          (value) =>
            value.caption !== undefined || value.location !== undefined,
          "At least one photo field must be supplied"
        ),
    })
    .strict(),
  z
    .object({
      name: z.literal("photo.move"),
      assetId: id,
      fromEventId: id,
      toEventId: id,
      afterAssetId: id.nullable(),
    })
    .strict(),
])

export const journeyMutationSchema = z
  .object({
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: id,
    command: journeyCommandSchema,
  })
  .strict()

export const journeyMutationResultSchema = z
  .object({
    journey: journeySnapshotSchema,
    eventId: id.optional(),
    replayed: z.boolean(),
  })
  .strict()

export type JourneyCommand = z.infer<typeof journeyCommandSchema>
export type JourneyMutation = z.infer<typeof journeyMutationSchema>
export type JourneyMutationResult = z.infer<typeof journeyMutationResultSchema>
export type EventInput = z.infer<typeof eventInputSchema>

export const journeyApiErrorSchema = z.object({
  error: z.string(),
  code: z.enum([
    "INVALID_INPUT",
    "NOT_FOUND",
    "FORBIDDEN",
    "REVISION_CONFLICT",
    "IDEMPOTENCY_CONFLICT",
    "OCR_UNAVAILABLE",
    "OCR_FAILED",
    "STORAGE_UNAVAILABLE",
  ]),
})
