import { z } from "zod"
import { targetDateTimeSchema, targetIdSchema } from "./common"
import { contributorSchema, receiptSchema } from "./receipts"
import { transitRouteSchema } from "./transit"
import {
  TARGET_TRANSPORT_MODES,
  TARGET_TRANSIT_PREFERENCES,
  TARGET_TRANSIT_REQUEST_MODES,
  TARGET_EVENT_EXECUTION_STATUSES,
} from "./enums"

export const EVENT_CATEGORIES = ["VISIT", "MEAL", "STAY", "TRANSIT"] as const

const id = targetIdSchema
const instant = targetDateTimeSchema
export const MAX_PHOTO_CAPTION_LENGTH = 100

export const eventDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`)
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    )
  }, "Invalid calendar date")

export const eventCoordinatesSchema = z
  .object({
    lat: z.number().finite().min(-90).max(90),
    lng: z.number().finite().min(-180).max(180),
    coordinateSystem: z.enum(["WGS84", "GCJ02", "BD09"]),
  })
  .strict()

export const eventLocationSchema = z
  .object({
    name: z.string().trim().min(1).max(300),
    address: z.string().max(1000).nullable(),
    city: z.string().trim().min(1).optional(),
    coordinates: eventCoordinatesSchema.nullable(),
  })
  .strict()

export const eventContentSchema = z
  .object({
    title: z.string().max(200),
    body: z.string().max(100_000),
    category: z.enum(EVENT_CATEGORIES),
    // Local calendar facts retain their precision; a date-only entry is not a
    // fabricated midnight instant, and none of these fields control chain order.
    date: eventDateSchema,
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
      .nullable(),
    timeZone: z.string().trim().min(1).max(100).nullable(),
    location: eventLocationSchema.nullable(),
  })
  .strict()

export const eventPhotoSchema = z
  .object({
    source: contributorSchema,
    canEdit: z.boolean(),
    assetId: id,
    url: z.string(),
    caption: z.string(),
    // null follows this event's current location without copying its coordinates.
    location: eventLocationSchema.nullable(),
    isCover: z.boolean(),
  })
  .strict()

export const eventPlanningSchema = z
  .object({
    startAt: instant.optional(),
    endAt: instant.optional(),
    durationMinutes: z.number().nonnegative().optional(),
    placeId: id.optional(),
    provider: z.string().min(1).optional(),
    providerPlaceId: id.optional(),
    coverImageUrl: z.string().url().optional(),
  })
  .strict()

export const eventHotelSchema = z
  .object({
    provider: z.literal("rollinggo"),
    providerHotelId: id,
    address: z.string().optional(),
    startingPrice: z
      .object({ amount: z.number().nonnegative(), currency: z.string().min(1) })
      .strict()
      .optional(),
    coverImageUrl: z.string().url().optional(),
    externalUrl: z.string().url().optional(),
    fetchedAt: instant,
    checkInNote: z.string().optional(),
  })
  .strict()

export const eventTransitSchema = z
  .object({
    fromName: z.string().trim().min(1).max(300),
    toName: z.string().trim().min(1).max(300),
    fromEventId: id.optional(),
    toEventId: id.optional(),
    transportMode: z.enum(TARGET_TRANSPORT_MODES),
    distanceMeters: z.number().finite().nonnegative().optional(),
    requestMode: z.enum(TARGET_TRANSIT_REQUEST_MODES).optional(),
    preference: z.enum(TARGET_TRANSIT_PREFERENCES).optional(),
    routeState: z.enum(["EMPTY", "READY", "ROUTE_STALE"]),
    route: transitRouteSchema.optional(),
    notes: z.string().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.routeState === "READY" &&
      (!value.fromEventId || !value.toEventId)
    )
      ctx.addIssue({
        code: "custom",
        message: "A resolved route requires linked endpoint events",
      })
    if ((value.routeState === "READY") !== Boolean(value.route))
      ctx.addIssue({
        code: "custom",
        path: ["route"],
        message: "Only READY transit has a resolved route",
      })
  })

// Recording and planning share a required local date and optional time/location facts.
export const journeyEventSchema = eventContentSchema
  .extend({
    id,
    source: contributorSchema,
    canEdit: z.boolean(),
    canRemove: z.boolean(),
    photos: z.array(eventPhotoSchema).max(100),
    receipts: z.array(receiptSchema).max(20),
    planning: eventPlanningSchema.optional(),
    hotel: eventHotelSchema.optional(),
    transit: eventTransitSchema.optional(),
    cuisine: z.string().optional(),
    bookingReference: z.string().optional(),
    executionStatus: z.enum(TARGET_EVENT_EXECUTION_STATUSES).optional(),
    actualStartAt: instant.optional(),
    actualEndAt: instant.optional(),
    createdAt: instant,
    updatedAt: instant,
  })
  .strict()
  .superRefine((event, ctx) => {
    if (event.timeZone !== null) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: event.timeZone })
      } catch {
        ctx.addIssue({
          code: "custom",
          path: ["timeZone"],
          message: "Invalid recording time zone",
        })
      }
    }

    if (event.hotel && event.category !== "STAY")
      ctx.addIssue({
        code: "custom",
        path: ["hotel"],
        message: "Hotel details belong to a stay",
      })
    if (event.transit && event.category !== "TRANSIT")
      ctx.addIssue({
        code: "custom",
        path: ["transit"],
        message: "Route details belong to a transit event",
      })
    if (event.category === "TRANSIT" && !event.transit)
      ctx.addIssue({
        code: "custom",
        path: ["transit"],
        message:
          "A transit event requires its endpoint names and transport mode",
      })
    for (const [start, end] of [
      [event.planning?.startAt, event.planning?.endAt],
      [event.actualStartAt, event.actualEndAt],
    ])
      if (start && end && Date.parse(end) < Date.parse(start))
        ctx.addIssue({
          code: "custom",
          message: "Event end cannot precede its start",
        })
    if (
      new Set(event.photos.map((photo) => photo.assetId)).size !==
      event.photos.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["photos"],
        message: "Photo ids must be unique within an event",
      })
  })
export type EventContent = z.infer<typeof eventContentSchema>
export type EventLocation = z.infer<typeof eventLocationSchema>
export type EventPhoto = z.infer<typeof eventPhotoSchema>
export type JourneyEvent = z.infer<typeof journeyEventSchema>
