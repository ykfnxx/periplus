import { z } from "zod"
import {
  targetActorReferenceSchema,
  targetIdSchema as idSchema,
} from "./common"
import { targetEventObservationCreateSchema } from "./content"
import { TARGET_COMMAND_NAMES } from "./enums"
import {
  targetConfirmActualSchema,
  targetJourneyEventCreateSchema,
  targetJourneyEventLinkCreateSchema,
  targetJourneyEventUpdatePatchSchema,
} from "./journey"

const targetPositionSchema = z.discriminatedUnion("placement", [
  z.object({ placement: z.literal("UNSCHEDULED") }),
  z.object({
    placement: z.literal("START"),
    parentSectionEventId: idSchema.nullable(),
  }),
  z.object({
    placement: z.literal("END"),
    parentSectionEventId: idSchema.nullable(),
  }),
  z.object({ placement: z.literal("BEFORE"), anchorEventId: idSchema }),
  z.object({ placement: z.literal("AFTER"), anchorEventId: idSchema }),
  z.object({
    placement: z.literal("BRANCH"),
    forkEventId: idSchema,
    joinEventId: idSchema,
    branchKey: idSchema,
  }),
])

export const targetCommandBodySchema = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("journey.add_event"),
    payload: z.object({
      event: targetJourneyEventCreateSchema,
      position: targetPositionSchema,
    }),
  }),
  z.object({
    name: z.literal("journey.update_event"),
    payload: z.object({
      eventId: idSchema,
      patch: targetJourneyEventUpdatePatchSchema,
    }),
  }),
  z.object({
    name: z.literal("journey.move_event"),
    payload: z.object({ eventId: idSchema, position: targetPositionSchema }),
  }),
  z.object({
    name: z.literal("journey.place_event"),
    payload: z.object({ eventId: idSchema, position: targetPositionSchema }),
  }),
  z.object({
    name: z.literal("journey.retire_event"),
    payload: z.object({
      eventId: idSchema,
      sectionChildren: z.enum(["RECURSIVE_RETIRE", "MOVE_CHILDREN"]).optional(),
      destinationSectionEventId: idSchema.nullable().optional(),
    }),
  }),
  z.object({
    name: z.literal("journey.replace_event"),
    payload: z.object({
      predecessorEventId: idSchema,
      successor: targetJourneyEventCreateSchema,
      reason: z.string().trim().min(1),
    }),
  }),
  z.object({
    name: z.literal("journey.add_link"),
    payload: z.object({ link: targetJourneyEventLinkCreateSchema }),
  }),
  z.object({
    name: z.literal("journey.retire_link"),
    payload: z.object({ linkId: idSchema }),
  }),
  z.object({
    name: z.literal("journey.select_branch"),
    payload: z.object({
      forkEventId: idSchema,
      selectedLinkId: idSchema,
      reason: z.string().optional(),
    }),
  }),
  z.object({
    name: z.literal("journey.plan_transit"),
    payload: z.object({
      eventId: idSchema,
      forceRefresh: z.boolean().default(false),
    }),
  }),
  z.object({
    name: z.literal("journey.select_transit_plan"),
    payload: z.object({ eventId: idSchema, planId: idSchema }),
  }),
  z.object({
    name: z.literal("journey.confirm_actual"),
    payload: z.object({
      eventId: idSchema,
      actual: targetConfirmActualSchema,
      finalize: z.boolean().optional(),
    }),
  }),
  z.object({
    name: z.literal("journey.skip_event"),
    payload: z.object({ eventId: idSchema, reason: z.string().optional() }),
  }),
  z.object({
    name: z.literal("journey.cancel_event"),
    payload: z.object({ eventId: idSchema, reason: z.string().optional() }),
  }),
  z.object({
    name: z.literal("journey.attach_asset"),
    payload: z.object({
      eventId: idSchema,
      assetId: idSchema,
      role: z.enum(["COVER", "GALLERY", "RECEIPT", "REFERENCE"]),
      visibility: z.enum(["PRIVATE", "JOURNEY", "PUBLIC"]),
      caption: z.string().optional(),
    }),
  }),
  z.object({
    name: z.literal("journey.add_observation"),
    payload: z.object({
      eventId: idSchema,
      observation: targetEventObservationCreateSchema,
    }),
  }),
  z.object({
    name: z.literal("journey.link_source_item"),
    payload: z.object({
      eventId: idSchema,
      sourceItemId: idSchema,
      role: z.enum(["INSPIRATION", "EVIDENCE", "NAVIGATION"]),
      excerpt: z.string().max(500).optional(),
      page: z.string().optional(),
      approvedForJourneySharing: z.boolean(),
    }),
  }),
  z.object({
    name: z.literal("journey.undo"),
    payload: z.object({ steps: z.number().int().positive().default(1) }),
  }),
  z.object({
    name: z.literal("workspace.refresh"),
    payload: z.object({
      fromWorkspaceRevision: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    name: z.literal("workspace.replay"),
    payload: z.object({
      fromWorkspaceRevision: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    name: z.literal("workspace.fork"),
    payload: z.object({
      fromWorkspaceRevision: z.number().int().nonnegative(),
    }),
  }),
  z.object({
    name: z.literal("workspace.commit"),
    payload: z.object({
      expectedJourneyRevision: z.number().int().positive().nullable(),
    }),
  }),
])

export const targetCommandEnvelopeSchema = z.object({
  aggregateId: idSchema,
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: idSchema,
  actor: targetActorReferenceSchema,
  command: targetCommandBodySchema,
})

export const targetLifecycleCommandOutcomeSchema = z.discriminatedUnion(
  "type",
  [
    z.object({
      type: z.literal("workspace.refreshed"),
      sourceJourneyId: idSchema,
      baseJourneyRevision: z.number().int().positive(),
      fromWorkspaceRevision: z.number().int().nonnegative(),
      throughWorkspaceRevision: z.number().int().nonnegative(),
      headWorkspaceRevision: z.number().int().positive(),
    }),
    z.object({
      type: z.literal("workspace.replayed"),
      sourceWorkspaceId: idSchema,
      fromWorkspaceRevision: z.number().int().nonnegative(),
      throughWorkspaceRevision: z.number().int().nonnegative(),
      headWorkspaceRevision: z.number().int().positive(),
    }),
    z.object({
      type: z.literal("workspace.forked"),
      workspaceId: idSchema,
      sourceWorkspaceId: idSchema,
      sourceWorkspaceRevision: z.number().int().nonnegative(),
      headWorkspaceRevision: z.number().int().nonnegative(),
    }),
    z.object({
      type: z.literal("workspace.committed"),
      journeyId: idSchema,
      fromWorkspaceRevision: z.number().int().nonnegative(),
      throughWorkspaceRevision: z.number().int().nonnegative(),
      committedJourneyRevision: z.number().int().positive(),
    }),
  ]
)

export const targetCommandResultSchema = z
  .object({
    aggregateId: idSchema,
    commandName: z.enum(TARGET_COMMAND_NAMES),
    newRevision: z.number().int().positive(),
    changedEventIds: z.array(idSchema),
    patch: z.unknown(),
    inversePatch: z.unknown(),
    projectionInvalidationScopes: z.array(idSchema.nullable()),
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
