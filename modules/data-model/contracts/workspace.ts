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
  targetJourneyGraphSnapshotSchema,
} from "./journey"

const idSchema = z.string().trim().min(1)
const dateTimeSchema = z.iso.datetime({ offset: true })

export const WORKSPACE_ACTIVE_LEASE_DAYS = 30
export const WORKSPACE_WEBSOCKET_TICKET_SECONDS = 300

export const targetWorkspaceSessionSchema = z
  .object({
    id: idSchema,
    ownerId: idSchema,
    sourceJourneyId: idSchema.nullable(),
    baseJourneyRevision: z.number().int().positive().nullable(),
    headWorkspaceRevision: z.number().int().nonnegative(),
    status: z.enum(TARGET_WORKSPACE_STATUSES),
    headGraph: targetJourneyGraphSnapshotSchema,
    expiresAt: dateTimeSchema,
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

export const targetWorkspaceRevisionSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  revision: z.number().int().positive(),
  commandName: z.enum(TARGET_COMMAND_NAMES),
  before: targetJourneyGraphSnapshotSchema,
  after: targetJourneyGraphSnapshotSchema,
  patch: z.unknown(),
  inversePatch: z.unknown(),
  actor: targetActorReferenceSchema,
  idempotencyKey: idSchema,
  createdAt: dateTimeSchema,
})

export const targetWorkspaceMessageSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  role: z.enum(["USER", "ASSISTANT", "SYSTEM"]),
  content: z.string(),
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

export const targetWorkspaceAgentRunSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  status: z.enum(TARGET_AGENT_RUN_STATUSES),
  startedAt: dateTimeSchema,
  completedAt: dateTimeSchema.optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
})

export const targetWorkspaceDocumentSchema = z.object({
  session: targetWorkspaceSessionSchema,
  accessState: z.enum(TARGET_WORKSPACE_ACCESS_STATES),
  draftState: z.enum(TARGET_WORKSPACE_DRAFT_STATES),
  messages: z.array(targetWorkspaceMessageSchema),
  suggestions: z.array(targetWorkspaceSuggestionSchema),
  agentRuns: z.array(targetWorkspaceAgentRunSchema),
})

export const targetWorkspaceWebSocketTicketClaimsSchema = z.object({
  subjectUserId: idSchema,
  workspaceId: idSchema,
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
  nonce: idSchema,
})

export type TargetWorkspaceSession = z.infer<
  typeof targetWorkspaceSessionSchema
>
export type TargetWorkspaceRevision = z.infer<
  typeof targetWorkspaceRevisionSchema
>
export type TargetWorkspaceDocument = z.infer<
  typeof targetWorkspaceDocumentSchema
>
