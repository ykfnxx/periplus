import { z } from "zod"
import { targetDateTimeSchema, targetIdSchema } from "./common"
import {
  contributorSchema,
  receiptInputSchema,
  receiptFieldsSchema,
  recordingReceiptSchema,
} from "./receipts"

export const RECORDING_CATEGORIES = [
  "VISIT",
  "MEAL",
  "STAY",
  "ACTIVITY",
  "TRANSIT",
] as const

const id = targetIdSchema
const instant = targetDateTimeSchema
export const MAX_RECORDING_PHOTO_CAPTION_LENGTH = 100

export const recordingDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    )
  }, "Invalid calendar date")

export const recordingCoordinatesSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    coordinateSystem: z.enum(["WGS84", "GCJ02", "BD09"]),
  })
  .strict()

export const recordingLocationSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    address: z.string().max(1000).nullable(),
    coordinates: recordingCoordinatesSchema.nullable(),
  })
  .strict()

export const recordingEventContentSchema = z
  .object({
    title: z.string().max(200),
    body: z.string().max(100_000),
    category: z.enum(RECORDING_CATEGORIES).nullable(),
    // Local calendar facts retain their precision; a date-only entry is not a
    // fabricated midnight instant, and none of these fields control chain order.
    date: recordingDateSchema.nullable(),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    timeZone: z.string().trim().min(1).max(100).nullable(),
    location: recordingLocationSchema.nullable(),
  })
  .strict()

export const recordingPhotoSchema = z
  .object({
    source: contributorSchema.optional(),
    canEdit: z.boolean().optional(),
    assetId: id,
    url: z.string(),
    caption: z.string(),
    // null follows this event's current location without copying its coordinates.
    location: recordingLocationSchema.nullable(),
    isCover: z.boolean(),
  })
  .strict()

export const recordingEventSchema = recordingEventContentSchema.extend({
  id,
  source: contributorSchema.optional(),
  canEdit: z.boolean().optional(),
  canRemove: z.boolean().optional(),
  receipts: z.array(recordingReceiptSchema).optional(),
  photos: z.array(recordingPhotoSchema),
  createdAt: instant,
  updatedAt: instant,
})

export const recordingJourneySchema = z
  .object({
    id,
    role: z.enum(["OWNER", "MEMBER"]).optional(),
    revision: z.number().int().positive(),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(10_000),
    status: z.enum(["DRAFT", "ACTIVE", "COMPLETED"]),
    visibility: z.literal("PRIVATE"),
    // Array order is the persisted author order, shared by editor and reader.
    events: z.array(recordingEventSchema),
    createdAt: instant,
    updatedAt: instant,
  })
  .strict()

export const recordingJourneySummarySchema = recordingJourneySchema
  .omit({ events: true })
  .extend({
    coverUrl: z.string().nullable(),
    eventCount: z.number().int().nonnegative(),
    photoCount: z.number().int().nonnegative(),
    startDate: recordingDateSchema.nullable(),
    endDate: recordingDateSchema.nullable(),
  })

export const recordingJourneyCreateSchema = z
  .object({
    idempotencyKey: id,
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(10_000).optional(),
  })
  .strict()

const eventInput = recordingEventContentSchema.partial()
const eventPatch = eventInput.refine(
  (value) => Object.keys(value).length > 0,
  "At least one field must be supplied"
)

export const recordingCommandSchema = z.discriminatedUnion("name", [
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
      content: eventInput,
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
          caption: z
            .string()
            .max(MAX_RECORDING_PHOTO_CAPTION_LENGTH)
            .optional(),
          location: recordingLocationSchema.nullable().optional(),
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

export const recordingMutationSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    idempotencyKey: id,
    command: recordingCommandSchema,
  })
  .strict()

export const recordingMutationResultSchema = z
  .object({
    journey: recordingJourneySchema,
    eventId: id.optional(),
    replayed: z.boolean(),
  })
  .strict()

export const recordingApiErrorSchema = z.object({
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

export type RecordingEventContent = z.infer<typeof recordingEventContentSchema>
export type RecordingLocation = z.infer<typeof recordingLocationSchema>
export type RecordingPhoto = z.infer<typeof recordingPhotoSchema>
export type RecordingEvent = z.infer<typeof recordingEventSchema>
export type RecordingJourney = z.infer<typeof recordingJourneySchema>
export type RecordingJourneySummary = z.infer<
  typeof recordingJourneySummarySchema
>
export type RecordingJourneyCreate = z.infer<
  typeof recordingJourneyCreateSchema
>
export type RecordingCommand = z.infer<typeof recordingCommandSchema>
export type RecordingMutation = z.infer<typeof recordingMutationSchema>
export type RecordingMutationResult = z.infer<
  typeof recordingMutationResultSchema
>

export type RecordingMapPhoto = RecordingPhoto & {
  journeyId: string
  journeyTitle: string
  eventId: string
  eventTitle: string
}
export type RecordingAtlas = {
  journeys: RecordingJourneySummary[]
  photos: RecordingMapPhoto[]
}
