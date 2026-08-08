import { z } from "zod"
import {
  TARGET_AGENT_RUN_STATUSES,
  TARGET_COMMAND_NAMES,
  TARGET_WORKSPACE_ACCESS_STATES,
  TARGET_WORKSPACE_DRAFT_STATES,
  TARGET_WORKSPACE_STATUSES,
} from "./enums"
import {
  targetActorReferenceSchema,
  targetDateTimeSchema as dateTimeSchema,
  targetIdSchema as idSchema,
} from "./common"
import { targetJourneyGraphSnapshotSchema } from "./journey"

export const WORKSPACE_WEBSOCKET_TICKET_SECONDS = 300
export const WORKSPACE_AGENT_RUN_LEASE_SECONDS = 60

export const targetWorkspaceSessionSchema = z
  .object({
    id: idSchema,
    ownerId: idSchema,
    sourceJourneyId: idSchema.nullable(),
    baseJourneyRevision: z.number().int().positive().nullable(),
    headWorkspaceRevision: z.number().int().nonnegative(),
    status: z.enum(TARGET_WORKSPACE_STATUSES),
    headGraph: targetJourneyGraphSnapshotSchema,
    lastAccessAt: dateTimeSchema,
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
    archivedAt: dateTimeSchema.optional(),
  })
  .superRefine((session, context) => {
    if (session.ownerId !== session.headGraph.ownerId) {
      context.addIssue({
        code: "custom",
        path: ["headGraph", "ownerId"],
        message: "workspace owner must own its draft graph",
      })
    }
    if (
      session.sourceJourneyId !== null &&
      session.sourceJourneyId !== session.headGraph.id
    ) {
      context.addIssue({
        code: "custom",
        path: ["sourceJourneyId"],
        message: "workspace source journey must match its draft graph",
      })
    }
    if (
      (session.sourceJourneyId === null) !==
      (session.baseJourneyRevision === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["baseJourneyRevision"],
        message:
          "new workspace has no base; existing journey workspace requires one",
      })
    }
  })

export const targetWorkspaceRevisionSchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    revision: z.number().int().positive(),
    parentRevisionId: idSchema.optional(),
    commandName: z.enum(TARGET_COMMAND_NAMES),
    before: targetJourneyGraphSnapshotSchema,
    after: targetJourneyGraphSnapshotSchema,
    patch: z.unknown(),
    inversePatch: z.unknown(),
    actor: targetActorReferenceSchema,
    idempotencyKey: idSchema,
    createdAt: dateTimeSchema,
  })
  .superRefine((revision, context) => {
    if (
      (revision.revision === 1 && revision.parentRevisionId) ||
      (revision.revision > 1 && !revision.parentRevisionId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["parentRevisionId"],
        message: "only the first workspace revision may omit its parent",
      })
    }
    if (
      revision.before.id !== revision.after.id ||
      revision.before.ownerId !== revision.after.ownerId
    ) {
      context.addIssue({
        code: "custom",
        path: ["after"],
        message: "workspace revision cannot change journey identity or owner",
      })
    }
  })

export const targetWorkspaceMessageSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  role: z.enum(["USER", "ASSISTANT", "SYSTEM"]),
  content: z.string(),
  blocks: z
    .array(
      z.discriminatedUnion("type", [
        z.object({
          type: z.literal("hotel_search"),
          title: z.string().trim().min(1),
          fetchedAt: dateTimeSchema,
          candidates: z.array(
            z.object({
              candidateId: z.string().trim().min(1),
              provider: z.literal("rollinggo"),
              providerHotelId: z.string().trim().min(1),
              name: z.string().trim().min(1),
              address: z.string().trim().min(1).optional(),
              startingPrice: z
                .object({
                  amount: z.number().nonnegative(),
                  currency: z.string().trim().min(1),
                })
                .optional(),
              imageUrl: z.string().url().optional(),
              externalUrl: z.string().url().optional(),
            })
          ),
        }),
        z.object({
          type: z.literal("place_search"),
          title: z.string().trim().min(1),
          fetchedAt: dateTimeSchema,
          candidates: z.array(
            z.object({
              candidateId: z.string().trim().min(1),
              name: z.string().trim().min(1),
              category: z.string().trim().min(1),
              address: z.string().trim().min(1).optional(),
              imageUrl: z.string().url().optional(),
            })
          ),
        }),
      ])
    )
    .default([]),
  agentRunId: idSchema.optional(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
})

export const targetWorkspaceSuggestionSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  title: z.string().trim().min(1),
  summary: z.string(),
  commandPayloads: z.array(z.unknown()),
  basedOnWorkspaceRevision: z.number().int().nonnegative(),
  status: z.enum(["PENDING", "ACCEPTED", "REJECTED", "STALE"]),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
})

export const targetWorkspaceAgentRunSchema = z
  .object({
    id: idSchema,
    workspaceId: idSchema,
    status: z.enum(TARGET_AGENT_RUN_STATUSES),
    runtimeOwnerId: idSchema.optional(),
    heartbeatAt: dateTimeSchema.optional(),
    leaseExpiresAt: dateTimeSchema.optional(),
    startedAt: dateTimeSchema,
    completedAt: dateTimeSchema.optional(),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
    createdAt: dateTimeSchema,
    updatedAt: dateTimeSchema,
  })
  .superRefine((run, context) => {
    if (
      run.status === "RUNNING" &&
      (!run.runtimeOwnerId || !run.heartbeatAt || !run.leaseExpiresAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["leaseExpiresAt"],
        message: "RUNNING Agent run requires runtime ownership and a lease",
      })
    }
    if (
      run.heartbeatAt &&
      run.leaseExpiresAt &&
      run.heartbeatAt >= run.leaseExpiresAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["leaseExpiresAt"],
        message: "Agent run lease must expire after its heartbeat",
      })
    }
  })

export const targetWorkspaceDocumentSchema = z.object({
  session: targetWorkspaceSessionSchema,
  accessState: z.enum(TARGET_WORKSPACE_ACCESS_STATES),
  draftState: z.enum(TARGET_WORKSPACE_DRAFT_STATES),
  messages: z.array(targetWorkspaceMessageSchema),
  suggestions: z.array(targetWorkspaceSuggestionSchema),
  agentRuns: z.array(targetWorkspaceAgentRunSchema),
})

export const targetWorkspaceHistoryEntrySchema = z.object({
  id: idSchema,
  sourceJourneyId: idSchema.nullable(),
  title: z.string().trim().min(1),
  preview: z.string(),
  updatedAt: dateTimeSchema,
})

export const targetWorkspaceWebSocketTicketClaimsSchema = z
  .object({
    subjectUserId: idSchema,
    workspaceId: idSchema,
    issuedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    nonce: idSchema,
  })
  .superRefine((claims, context) => {
    const lifetimeSeconds = claims.expiresAt - claims.issuedAt
    if (
      lifetimeSeconds <= 0 ||
      lifetimeSeconds > WORKSPACE_WEBSOCKET_TICKET_SECONDS
    ) {
      context.addIssue({
        code: "custom",
        path: ["expiresAt"],
        message: `WebSocket ticket lifetime must be between 1 and ${WORKSPACE_WEBSOCKET_TICKET_SECONDS} seconds`,
      })
    }
  })

export type TargetWorkspaceSession = z.infer<
  typeof targetWorkspaceSessionSchema
>
export type TargetWorkspaceRevision = z.infer<
  typeof targetWorkspaceRevisionSchema
>
export type TargetWorkspaceMessage = z.infer<
  typeof targetWorkspaceMessageSchema
>
export type TargetWorkspaceDocument = z.infer<
  typeof targetWorkspaceDocumentSchema
>
export type TargetWorkspaceHistoryEntry = z.infer<
  typeof targetWorkspaceHistoryEntrySchema
>
