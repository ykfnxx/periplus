import { z } from "zod"
import {
  targetIdSchema as id,
  targetDateTimeSchema as instant,
  targetActorReferenceSchema,
} from "./common"
import {
  eventContentSchema,
  eventLocationSchema,
  eventPlanningSchema,
  eventHotelSchema,
  eventTransitSchema,
  MAX_PHOTO_CAPTION_LENGTH,
} from "./event"
import { receiptInputSchema, receiptFieldsSchema } from "./receipts"
import { journeySnapshotSchema } from "./journey"
import { TARGET_EVENT_EXECUTION_STATUSES, TARGET_COMMAND_NAMES } from "./enums"

export const eventInputSchema = eventContentSchema
  .partial()
  .extend({
    planning: eventPlanningSchema.nullable().optional(),
    hotel: eventHotelSchema.nullable().optional(),
    transit: eventTransitSchema.nullable().optional(),
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

export const targetCommandBodySchema = z.union([
  journeyCommandSchema,
  z.discriminatedUnion("name", [
    z
      .object({
        name: z.literal("journey.undo"),
        payload: z.object({ steps: z.number().int().positive().default(1) }),
      })
      .strict(),
    z
      .object({
        name: z.literal("workspace.refresh"),
        payload: z.object({
          fromWorkspaceRevision: z.number().int().nonnegative(),
        }),
      })
      .strict(),
    z
      .object({
        name: z.literal("workspace.replay"),
        payload: z.object({
          fromWorkspaceRevision: z.number().int().nonnegative(),
        }),
      })
      .strict(),
    z
      .object({
        name: z.literal("workspace.fork"),
        payload: z.object({
          fromWorkspaceRevision: z.number().int().nonnegative(),
        }),
      })
      .strict(),
    z
      .object({
        name: z.literal("workspace.commit"),
        payload: z.object({
          expectedJourneyRevision: z.number().int().positive().nullable(),
        }),
      })
      .strict(),
  ]),
])
export const targetCommandEnvelopeSchema = z
  .object({
    aggregateId: id,
    expectedRevision: z.number().int().nonnegative(),
    idempotencyKey: id,
    actor: targetActorReferenceSchema,
    command: targetCommandBodySchema,
  })
  .strict()
export type JourneyCommand = z.infer<typeof journeyCommandSchema>
export type JourneyMutation = z.infer<typeof journeyMutationSchema>
export type JourneyMutationResult = z.infer<typeof journeyMutationResultSchema>
export type EventInput = z.infer<typeof eventInputSchema>
export const targetLifecycleCommandOutcomeSchema = z.discriminatedUnion(
  "type",
  [
    z.object({
      type: z.literal("workspace.refreshed"),
      sourceJourneyId: id,
      baseJourneyRevision: z.number().int().positive(),
      fromWorkspaceRevision: z.number().int().nonnegative(),
      throughWorkspaceRevision: z.number().int().nonnegative(),
      headWorkspaceRevision: z.number().int().positive(),
    }),
    z.object({
      type: z.literal("workspace.replayed"),
      sourceWorkspaceId: id,
      fromWorkspaceRevision: z.number().int().nonnegative(),
      throughWorkspaceRevision: z.number().int().nonnegative(),
      headWorkspaceRevision: z.number().int().positive(),
    }),
    z.object({
      type: z.literal("workspace.forked"),
      workspaceId: id,
      sourceWorkspaceId: id,
      sourceWorkspaceRevision: z.number().int().nonnegative(),
      headWorkspaceRevision: z.number().int().nonnegative(),
    }),
    z.object({
      type: z.literal("workspace.committed"),
      journeyId: id,
      fromWorkspaceRevision: z.number().int().nonnegative(),
      throughWorkspaceRevision: z.number().int().nonnegative(),
      committedJourneyRevision: z.number().int().positive(),
    }),
  ]
)

export const targetCommandResultSchema = z
  .object({
    aggregateId: id,
    commandName: z.enum(TARGET_COMMAND_NAMES),
    newRevision: z.number().int().positive(),
    changedEventIds: z.array(id),
    patch: z.unknown(),
    inversePatch: z.unknown(),

    replayedFromIdempotencyKey: z.boolean(),
    outcome: targetLifecycleCommandOutcomeSchema.optional(),
  })
  .superRefine((result, context) => {
    const expectedOutcome = (
      {
        "workspace.refresh": "workspace.refreshed",
        "workspace.replay": "workspace.replayed",
        "workspace.fork": "workspace.forked",
        "workspace.commit": "workspace.committed",
      } as Partial<Record<(typeof TARGET_COMMAND_NAMES)[number], string>>
    )[result.commandName]
    if (expectedOutcome && result.outcome?.type !== expectedOutcome) {
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message: `${result.commandName} requires a ${expectedOutcome} outcome`,
      })
    }
    if (!expectedOutcome && result.outcome) {
      context.addIssue({
        code: "custom",
        path: ["outcome"],
        message: "Journey commands cannot return a Workspace lifecycle outcome",
      })
    }
  })

export type TargetCommandEnvelope = z.infer<typeof targetCommandEnvelopeSchema>
export type TargetCommandResult = z.infer<typeof targetCommandResultSchema>
export type TargetLifecycleCommandOutcome = z.infer<
  typeof targetLifecycleCommandOutcomeSchema
>

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
