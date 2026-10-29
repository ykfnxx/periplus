import { z } from "zod"
import {
  targetIdSchema as id,
  targetDateTimeSchema as instant,
  journeyActorSchema,
} from "./common"
import { journeyEventSchema, eventDateSchema } from "./event"

const journeyBaseSchema = z
  .object({
    id,
    ownerId: id,
    role: z.enum(["OWNER", "MEMBER"]),
    revision: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(200),
    description: z.string().max(10_000),
    status: z.enum(["DRAFT", "ACTIVE", "COMPLETED"]),
    visibility: z.enum(["PRIVATE", "UNLISTED", "PUBLIC"]),
    // This array is the only writable order. Geography never owns other events.
    events: z.array(journeyEventSchema),
    createdAt: instant,
    updatedAt: instant,
    deletedAt: instant.optional(),
  })
  .strict()
export const journeySnapshotSchema = journeyBaseSchema.superRefine(
  (journey, ctx) => {
    if (
      new Set(journey.events.map((event) => event.id)).size !==
      journey.events.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["events"],
        message: "Event ids must be unique",
      })
    for (const [index, event] of journey.events.entries()) {
      if (!event.transit) continue
      const { fromEventId, toEventId, routeState } = event.transit
      if (
        fromEventId === toEventId ||
        fromEventId === event.id ||
        toEventId === event.id
      )
        ctx.addIssue({
          code: "custom",
          path: ["events", index, "transit"],
          message: "Transit endpoints must be distinct events",
        })
      if (
        routeState === "READY" &&
        (journey.events[index - 1]?.id !== fromEventId ||
          journey.events[index + 1]?.id !== toEventId)
      )
        ctx.addIssue({
          code: "custom",
          path: ["events", index, "transit"],
          message: "READY transit connects its immediate neighbours",
        })
    }
  }
)

export const journeySummarySchema = journeyBaseSchema
  .omit({ events: true })
  .extend({
    coverUrl: z.string().nullable(),
    eventCount: z.number().int().nonnegative(),
    photoCount: z.number().int().nonnegative(),
    startDate: eventDateSchema.nullable(),
    endDate: eventDateSchema.nullable(),
  })
export const journeyCreateSchema = z
  .object({
    idempotencyKey: id,
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(10_000).optional(),
  })
  .strict()
export const journeyRevisionSchema = z
  .object({
    id,
    journeyId: id,
    revision: z.number().int().positive(),
    operation: z.string().min(1),
    snapshot: journeySnapshotSchema,
    patch: z.unknown(),
    inversePatch: z.unknown(),
    actor: journeyActorSchema,
    idempotencyKey: id,
    parentRevisionId: id.optional(),
    createdAt: instant,
  })
  .strict()
  .superRefine((revision, ctx) => {
    if (
      revision.snapshot.id !== revision.journeyId ||
      revision.snapshot.revision !== revision.revision
    )
      ctx.addIssue({
        code: "custom",
        path: ["snapshot"],
        message: "Snapshot must match revision identity",
      })
  })
export type JourneySnapshot = z.infer<typeof journeySnapshotSchema>
export type JourneySummary = z.infer<typeof journeySummarySchema>
export type JourneyCreate = z.infer<typeof journeyCreateSchema>
export type JourneyRevision = z.infer<typeof journeyRevisionSchema>
export type MapPhoto = import("./event").EventPhoto & {
  journeyId: string
  journeyTitle: string
  eventId: string
  eventTitle: string
}
export type JourneyAtlas = { journeys: JourneySummary[]; photos: MapPhoto[] }
