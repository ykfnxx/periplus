import { z } from "zod"
import {
  TARGET_COORDINATE_SYSTEMS,
  TARGET_GEOMETRY_KINDS,
  TARGET_TRANSIT_SEGMENT_MODES,
  TARGET_TRANSIT_PREFERENCES,
  TARGET_TRANSPORT_MODES,
} from "./enums"
import {
  targetDateTimeSchema as dateTimeSchema,
  targetIdSchema as idSchema,
} from "./common"

export const FLAT_JOURNEY_SCHEMA_VERSION = 1

const eventKeySchema = z.string().trim().min(1)

export const targetFlatJourneyCitySchema = z
  .object({
    key: eventKeySchema,
    name: z.string().trim().min(1),
    timeZone: z.string().trim().min(1),
  })
  .strict()

const targetFlatJourneyPlaceSchema = z
  .object({
    name: z.string().trim().min(1),
    address: z.string().trim().min(1).optional(),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    coordinateSystem: z.enum(TARGET_COORDINATE_SYSTEMS),
    provider: z.string().trim().min(1),
    providerPlaceId: z.string().trim().min(1).optional(),
  })
  .strict()

const targetFlatJourneyEventBase = {
  eventId: eventKeySchema,
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  city: targetFlatJourneyCitySchema,
  plannedStartAt: dateTimeSchema.optional(),
  plannedEndAt: dateTimeSchema.optional(),
}

const targetFlatJourneyLocationDetailSchema = z
  .object({
    place: targetFlatJourneyPlaceSchema,
    plannedDurationMinutes: z.number().int().positive().optional(),
  })
  .strict()

const targetFlatJourneyVisitSchema = z
  .object({
    ...targetFlatJourneyEventBase,
    kind: z.literal("VISIT"),
    detail: targetFlatJourneyLocationDetailSchema.extend({
      coverImageUrl: z.string().url().optional(),
    }),
  })
  .strict()

const targetFlatJourneyMealSchema = z
  .object({
    ...targetFlatJourneyEventBase,
    kind: z.literal("MEAL"),
    detail: targetFlatJourneyLocationDetailSchema.extend({
      cuisine: z.string().trim().min(1).optional(),
    }),
  })
  .strict()

const targetFlatJourneyActivitySchema = z
  .object({
    ...targetFlatJourneyEventBase,
    kind: z.literal("ACTIVITY"),
    detail: targetFlatJourneyLocationDetailSchema.extend({
      bookingReference: z.string().trim().min(1).optional(),
    }),
  })
  .strict()

const targetFlatJourneyStaySchema = z
  .object({
    ...targetFlatJourneyEventBase,
    kind: z.literal("STAY"),
    detail: targetFlatJourneyLocationDetailSchema.extend({
      checkInNote: z.string().trim().min(1).optional(),
      hotel: z
        .object({
          provider: z.literal("rollinggo"),
          name: z.string().trim().min(1),
          address: z.string().trim().min(1).optional(),
          startingPrice: z
            .object({
              amount: z.number().nonnegative(),
              currency: z.string().trim().min(1),
            })
            .strict()
            .optional(),
          coverImageUrl: z.string().url().optional(),
          externalUrl: z.string().url().optional(),
          fetchedAt: dateTimeSchema,
        })
        .strict(),
    }),
  })
  .strict()

const targetFlatJourneyTransitSchema = z
  .object({
    eventId: eventKeySchema,
    kind: z.literal("TRANSIT"),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    plannedStartAt: dateTimeSchema.optional(),
    plannedEndAt: dateTimeSchema.optional(),
    detail: z
      .object({
        fromEventKey: eventKeySchema,
        toEventKey: eventKeySchema,
        fromCity: targetFlatJourneyCitySchema,
        toCity: targetFlatJourneyCitySchema,
        transportMode: z.enum(TARGET_TRANSPORT_MODES),
        preference: z.enum(TARGET_TRANSIT_PREFERENCES).optional(),
        plannedDurationMinutes: z.number().int().nonnegative().optional(),
        plannedDistanceKm: z.number().nonnegative().optional(),
        routeState: z.enum(["EMPTY", "READY", "ROUTE_STALE"]),
        route: z
          .object({
            provider: z.string().trim().min(1),
            calculatedAt: dateTimeSchema,
            label: z.string().trim().min(1),
            segments: z.array(
              z
                .object({
                  mode: z.enum(TARGET_TRANSIT_SEGMENT_MODES),
                  coordinateSystem: z.enum(TARGET_COORDINATE_SYSTEMS),
                  geometryKind: z.enum(TARGET_GEOMETRY_KINDS),
                  positions: z.array(z.tuple([z.number(), z.number()])),
                  trafficSections: z
                    .array(
                      z
                        .object({
                          status: z.enum([
                            "UNKNOWN",
                            "FREE_FLOW",
                            "SLOW",
                            "CONGESTED",
                            "SEVERE",
                          ]),
                          positions: z.array(z.tuple([z.number(), z.number()])),
                        })
                        .strict()
                    )
                    .optional(),
                })
                .strict()
            ),
          })
          .strict()
          .optional(),
      })
      .strict()
      .superRefine((detail, context) => {
        if (detail.routeState === "READY" && !detail.route) {
          context.addIssue({
            code: "custom",
            path: ["route"],
            message: "READY TRANSIT requires a selected route snapshot",
          })
        }
        if (detail.routeState !== "READY" && detail.route) {
          context.addIssue({
            code: "custom",
            path: ["route"],
            message: "only READY TRANSIT may expose a selected route snapshot",
          })
        }
      }),
  })
  .strict()

export const targetFlatJourneyEventSchema = z.discriminatedUnion("kind", [
  targetFlatJourneyVisitSchema,
  targetFlatJourneyMealSchema,
  targetFlatJourneyActivitySchema,
  targetFlatJourneyStaySchema,
  targetFlatJourneyTransitSchema,
])

export const targetFlatJourneySnapshotSchema = z
  .object({
    schemaVersion: z.literal(FLAT_JOURNEY_SCHEMA_VERSION),
    journeyId: idSchema,
    revision: z.number().int().nonnegative(),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    events: z.array(targetFlatJourneyEventSchema),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const eventKeys = snapshot.events.map((event) => event.eventId)
    if (new Set(eventKeys).size !== eventKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["events"],
        message: "flat Journey event keys must be unique",
      })
    }
    const eventByKey = new Map(
      snapshot.events.map((event) => [event.eventId, event])
    )
    for (const [index, event] of snapshot.events.entries()) {
      if (
        event.plannedStartAt &&
        event.plannedEndAt &&
        event.plannedEndAt < event.plannedStartAt
      ) {
        context.addIssue({
          code: "custom",
          path: ["events", index, "plannedEndAt"],
          message: "event end cannot precede start",
        })
      }
      if (event.kind !== "TRANSIT") continue
      const fromIndex = eventKeys.indexOf(event.detail.fromEventKey)
      const toIndex = eventKeys.indexOf(event.detail.toEventKey)
      if (
        !eventByKey.has(event.detail.fromEventKey) ||
        !eventByKey.has(event.detail.toEventKey) ||
        fromIndex !== index - 1 ||
        toIndex !== index + 1
      ) {
        context.addIssue({
          code: "custom",
          path: ["events", index, "detail"],
          message: "TRANSIT must connect its immediate path neighbours",
        })
      }
    }
  })

export type TargetFlatJourneyCity = z.infer<typeof targetFlatJourneyCitySchema>
export type TargetFlatJourneyEvent = z.infer<
  typeof targetFlatJourneyEventSchema
>
export type TargetFlatJourneySnapshot = z.infer<
  typeof targetFlatJourneySnapshotSchema
>
