import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import type { AuthContext } from "@/modules/auth/server/context"
import { isAdmin, PermissionDeniedError } from "@/modules/auth/server/context"
import {
  targetActorReferenceSchema,
  targetJourneyGraphSnapshotSchema,
  targetWorkspaceAgentRunSchema,
  targetWorkspaceDocumentSchema,
  targetWorkspaceMessageSchema,
  targetWorkspaceRevisionSchema,
  targetWorkspaceSessionSchema,
  targetWorkspaceSuggestionSchema,
  WORKSPACE_ACTIVE_LEASE_DAYS,
  type TargetActorReference,
  type TargetJourneyGraphSnapshot,
  type TargetWorkspaceDocument,
  type TargetWorkspaceRevision,
  type TargetWorkspaceSession,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"

export class WorkspaceInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkspaceInputError"
  }
}

export class WorkspaceRevisionConflictError extends Error {
  constructor(message = "Workspace was updated by another request") {
    super(message)
    this.name = "WorkspaceRevisionConflictError"
  }
}

export class WorkspaceIdempotencyConflictError extends Error {
  constructor(message = "Workspace idempotency key has another payload") {
    super(message)
    this.name = "WorkspaceIdempotencyConflictError"
  }
}

const workspaceInclude = {
  revisions: { orderBy: [{ revision: "asc" as const }] },
  messages: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
  suggestions: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
  agentRuns: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
} satisfies Prisma.WorkspaceSessionInclude

type WorkspaceRecord = Prisma.WorkspaceSessionGetPayload<{
  include: typeof workspaceInclude
}>

type TargetWorkspaceMessage = z.infer<typeof targetWorkspaceMessageSchema>
type TargetWorkspaceSuggestion = z.infer<typeof targetWorkspaceSuggestionSchema>
type TargetWorkspaceAgentRun = z.infer<typeof targetWorkspaceAgentRunSchema>

const commandNames = {
  "journey.add_event": "JOURNEY_ADD_EVENT",
  "journey.update_event": "JOURNEY_UPDATE_EVENT",
  "journey.move_event": "JOURNEY_MOVE_EVENT",
  "journey.place_event": "JOURNEY_PLACE_EVENT",
  "journey.retire_event": "JOURNEY_RETIRE_EVENT",
  "journey.replace_event": "JOURNEY_REPLACE_EVENT",
  "journey.add_link": "JOURNEY_ADD_LINK",
  "journey.retire_link": "JOURNEY_RETIRE_LINK",
  "journey.select_branch": "JOURNEY_SELECT_BRANCH",
  "journey.plan_transit": "JOURNEY_PLAN_TRANSIT",
  "journey.select_transit_plan": "JOURNEY_SELECT_TRANSIT_PLAN",
  "journey.confirm_actual": "JOURNEY_CONFIRM_ACTUAL",
  "journey.skip_event": "JOURNEY_SKIP_EVENT",
  "journey.cancel_event": "JOURNEY_CANCEL_EVENT",
  "journey.attach_asset": "JOURNEY_ATTACH_ASSET",
  "journey.add_observation": "JOURNEY_ADD_OBSERVATION",
  "journey.link_source_item": "JOURNEY_LINK_SOURCE_ITEM",
  "journey.undo": "JOURNEY_UNDO",
  "workspace.refresh": "WORKSPACE_REFRESH",
  "workspace.replay": "WORKSPACE_REPLAY",
  "workspace.fork": "WORKSPACE_FORK",
  "workspace.commit": "WORKSPACE_COMMIT",
} as const satisfies Record<
  TargetWorkspaceRevision["commandName"],
  Prisma.WorkspaceRevisionUncheckedCreateInput["commandName"]
>

const contractCommandNames = Object.fromEntries(
  Object.entries(commandNames).map(([contract, database]) => [
    database,
    contract,
  ])
) as Record<
  Prisma.WorkspaceRevisionUncheckedCreateInput["commandName"],
  TargetWorkspaceRevision["commandName"]
>

function leaseExpiry(now: Date) {
  return new Date(
    now.getTime() + WORKSPACE_ACTIVE_LEASE_DAYS * 24 * 60 * 60 * 1000
  )
}

function json(value: unknown) {
  return JSON.stringify(value)
}

function parseGraph(value: string, label: string) {
  try {
    return targetJourneyGraphSnapshotSchema.parse(JSON.parse(value))
  } catch (error) {
    throw new WorkspaceInputError(
      `${label} is invalid: ${error instanceof Error ? error.message : "invalid graph"}`
    )
  }
}

function actorFromRecord(record: {
  actorKind: "USER" | "AGENT" | "SYSTEM"
  actorUserId: string | null
  actorAgentRunId: string | null
}): TargetActorReference {
  return targetActorReferenceSchema.parse(
    record.actorKind === "USER"
      ? { kind: "USER", userId: record.actorUserId }
      : record.actorKind === "AGENT"
        ? { kind: "AGENT", agentRunId: record.actorAgentRunId }
        : { kind: "SYSTEM" }
  )
}

function actorColumns(actor: TargetActorReference) {
  return actor.kind === "USER"
    ? {
        actorKind: actor.kind,
        actorUserId: actor.userId,
        actorAgentRunId: null,
      }
    : actor.kind === "AGENT"
      ? {
          actorKind: actor.kind,
          actorUserId: null,
          actorAgentRunId: actor.agentRunId,
        }
      : {
          actorKind: actor.kind,
          actorUserId: null,
          actorAgentRunId: null,
        }
}

function mapSession(record: WorkspaceRecord): TargetWorkspaceSession {
  return targetWorkspaceSessionSchema.parse({
    id: record.id,
    ownerId: record.ownerId,
    sourceJourneyId: record.sourceJourneyId,
    baseJourneyRevision: record.baseJourneyRevision,
    headWorkspaceRevision: record.headWorkspaceRevision,
    status: record.status,
    headGraph: parseGraph(record.headGraphJson, `Workspace ${record.id} head`),
    expiresAt: record.expiresAt.toISOString(),
    lastAccessAt: record.lastAccessAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    archivedAt: record.archivedAt?.toISOString(),
  })
}

function mapRevision(
  record: WorkspaceRecord["revisions"][number]
): TargetWorkspaceRevision {
  return targetWorkspaceRevisionSchema.parse({
    id: record.id,
    workspaceId: record.workspaceId,
    revision: record.revision,
    parentRevisionId: record.parentRevisionId ?? undefined,
    commandName: contractCommandNames[record.commandName],
    before: parseGraph(
      record.beforeGraphJson,
      `WorkspaceRevision ${record.id} before`
    ),
    after: parseGraph(
      record.afterGraphJson,
      `WorkspaceRevision ${record.id} after`
    ),
    patch: JSON.parse(record.patchJson),
    inversePatch: JSON.parse(record.inversePatchJson),
    actor: actorFromRecord(record),
    idempotencyKey: record.idempotencyKey,
    createdAt: record.createdAt.toISOString(),
  })
}

function mapMessage(
  record: WorkspaceRecord["messages"][number]
): TargetWorkspaceMessage {
  return targetWorkspaceMessageSchema.parse({
    id: record.id,
    workspaceId: record.workspaceId,
    role: record.role,
    content: record.content,
    agentRunId: record.agentRunId ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}

function mapSuggestion(
  record: WorkspaceRecord["suggestions"][number]
): TargetWorkspaceSuggestion {
  return targetWorkspaceSuggestionSchema.parse({
    id: record.id,
    workspaceId: record.workspaceId,
    title: record.title,
    summary: record.summary,
    commandPayloads: JSON.parse(record.commandPayloadsJson),
    basedOnWorkspaceRevision: record.basedOnWorkspaceRevision,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}

function mapAgentRun(
  record: WorkspaceRecord["agentRuns"][number]
): TargetWorkspaceAgentRun {
  return targetWorkspaceAgentRunSchema.parse({
    id: record.id,
    workspaceId: record.workspaceId,
    status: record.status,
    startedAt: record.startedAt.toISOString(),
    completedAt: record.completedAt?.toISOString(),
    errorCode: record.errorCode ?? undefined,
    errorMessage: record.errorMessage ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}

function assertOwner(context: AuthContext, ownerId: string) {
  if (!isAdmin(context) && ownerId !== context.userId) {
    throw new PermissionDeniedError("Workspace does not belong to this user")
  }
}

async function ownedWorkspace(
  context: AuthContext,
  workspaceId: string,
  include: Prisma.WorkspaceSessionInclude = workspaceInclude
) {
  const record = await prisma.workspaceSession.findUnique({
    where: { id: workspaceId },
    include,
  })
  if (!record) return null
  assertOwner(context, record.ownerId)
  return record
}

async function touchOrExpire(record: WorkspaceRecord, now: Date) {
  if (record.status !== "ACTIVE") return record
  if (record.expiresAt <= now) {
    return prisma.workspaceSession.update({
      where: { id: record.id },
      data: { status: "EXPIRED" },
      include: workspaceInclude,
    })
  }
  if (record.lastAccessAt >= now) return record
  return prisma.workspaceSession.update({
    where: { id: record.id },
    data: { lastAccessAt: now, expiresAt: leaseExpiry(now) },
    include: workspaceInclude,
  })
}

async function requireActiveWorkspace(
  record: {
    id: string
    status: TargetWorkspaceSession["status"]
    expiresAt: Date
    lastAccessAt: Date
  },
  now: Date
) {
  if (record.status !== "ACTIVE" || record.expiresAt <= now) {
    if (record.status === "ACTIVE") {
      await prisma.workspaceSession.updateMany({
        where: { id: record.id, status: "ACTIVE", expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      })
    }
    throw new WorkspaceInputError("Workspace is not active")
  }
  if (record.lastAccessAt < now) {
    await prisma.workspaceSession.updateMany({
      where: { id: record.id, status: "ACTIVE", expiresAt: { gt: now } },
      data: { lastAccessAt: now, expiresAt: leaseExpiry(now) },
    })
  }
}

export async function createWorkspace(
  context: AuthContext,
  input: {
    id?: string
    graph: TargetJourneyGraphSnapshot
    sourceJourneyId?: string
    baseJourneyRevision?: number
    now?: Date
  }
) {
  const graph = targetJourneyGraphSnapshotSchema.parse(input.graph)
  if (graph.ownerId !== context.userId && !isAdmin(context)) {
    throw new PermissionDeniedError("Workspace graph must belong to its owner")
  }
  const hasSource = input.sourceJourneyId !== undefined
  if (hasSource !== (input.baseJourneyRevision !== undefined)) {
    throw new WorkspaceInputError(
      "source Journey and base revision must be provided together"
    )
  }
  if (input.sourceJourneyId && input.sourceJourneyId !== graph.id) {
    throw new WorkspaceInputError("source Journey must match graph identity")
  }
  if (input.sourceJourneyId) {
    const source = await prisma.journey.findFirst({
      where: {
        id: input.sourceJourneyId,
        ownerId: graph.ownerId,
        revision: input.baseJourneyRevision,
        deletedAt: null,
      },
      select: { id: true },
    })
    if (!source) {
      throw new WorkspaceInputError("source Journey base revision not found")
    }
  }

  const now = input.now ?? new Date()
  const record = await prisma.workspaceSession.create({
    data: {
      id: input.id ?? randomUUID(),
      ownerId: graph.ownerId,
      sourceJourneyId: input.sourceJourneyId ?? null,
      baseJourneyRevision: input.baseJourneyRevision ?? null,
      headGraphJson: json(graph),
      expiresAt: leaseExpiry(now),
      lastAccessAt: now,
      createdAt: now,
    },
    include: workspaceInclude,
  })
  return mapSession(record)
}

export async function getWorkspaceDocument(
  context: AuthContext,
  workspaceId: string,
  now = new Date()
): Promise<TargetWorkspaceDocument | null> {
  const found = await ownedWorkspace(context, workspaceId)
  if (!found) return null
  const record = await touchOrExpire(found as WorkspaceRecord, now)
  const session = mapSession(record)
  const sourceRevision = session.sourceJourneyId
    ? await prisma.journey.findUnique({
        where: { id: session.sourceJourneyId },
        select: { revision: true },
      })
    : null
  const draftState =
    session.status === "ACTIVE" &&
    sourceRevision &&
    session.baseJourneyRevision !== null &&
    sourceRevision.revision > session.baseJourneyRevision
      ? "STALE"
      : session.headWorkspaceRevision > 0
        ? "DIRTY"
        : "CLEAN"

  return targetWorkspaceDocumentSchema.parse({
    session,
    accessState: session.status === "EXPIRED" ? "EXPIRED" : "OWNER",
    draftState,
    messages: record.messages.map(mapMessage),
    suggestions: record.suggestions.map(mapSuggestion),
    agentRuns: record.agentRuns.map(mapAgentRun),
  })
}

export async function appendWorkspaceRevision(
  context: AuthContext,
  workspaceId: string,
  input: {
    expectedRevision: number
    commandName: TargetWorkspaceRevision["commandName"]
    after: TargetJourneyGraphSnapshot
    patch: unknown
    inversePatch: unknown
    idempotencyKey: string
    actor?: TargetActorReference
    now?: Date
  }
) {
  const after = targetJourneyGraphSnapshotSchema.parse(input.after)
  const actor = targetActorReferenceSchema.parse(
    input.actor ?? { kind: "USER", userId: context.userId }
  )
  if (actor.kind !== "USER" || actor.userId !== context.userId) {
    throw new WorkspaceInputError(
      "direct Workspace writes require the authenticated USER actor"
    )
  }
  const now = input.now ?? new Date()

  return prisma.$transaction(async (tx) => {
    const record = await tx.workspaceSession.findUnique({
      where: { id: workspaceId },
      include: workspaceInclude,
    })
    if (!record) return null
    assertOwner(context, record.ownerId)

    const existing = await tx.workspaceRevision.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    })
    if (existing) {
      if (
        existing.commandName !== commandNames[input.commandName] ||
        existing.afterGraphJson !== json(after) ||
        existing.patchJson !== json(input.patch) ||
        existing.inversePatchJson !== json(input.inversePatch)
      ) {
        throw new WorkspaceIdempotencyConflictError()
      }
      return mapRevision(existing)
    }
    if (record.status !== "ACTIVE" || record.expiresAt <= now) {
      if (record.status === "ACTIVE") {
        await tx.workspaceSession.update({
          where: { id: workspaceId },
          data: { status: "EXPIRED" },
        })
      }
      throw new WorkspaceInputError("Workspace is not active")
    }
    if (record.headWorkspaceRevision !== input.expectedRevision) {
      throw new WorkspaceRevisionConflictError()
    }

    const before = parseGraph(
      record.headGraphJson,
      `Workspace ${workspaceId} head`
    )
    if (
      after.id !== before.id ||
      after.ownerId !== before.ownerId ||
      after.ownerId !== record.ownerId
    ) {
      throw new WorkspaceInputError(
        "Workspace revision cannot change graph identity or owner"
      )
    }
    const parent =
      record.headWorkspaceRevision > 0
        ? await tx.workspaceRevision.findUnique({
            where: {
              workspaceId_revision: {
                workspaceId,
                revision: record.headWorkspaceRevision,
              },
            },
            select: { id: true },
          })
        : null
    if (record.headWorkspaceRevision > 0 && !parent) {
      throw new WorkspaceRevisionConflictError(
        "Workspace head has no persisted parent revision"
      )
    }
    const revision = await tx.workspaceRevision.create({
      data: {
        id: randomUUID(),
        workspaceId,
        revision: record.headWorkspaceRevision + 1,
        parentRevisionId: parent?.id ?? null,
        commandName: commandNames[input.commandName],
        beforeGraphJson: json(before),
        afterGraphJson: json(after),
        patchJson: json(input.patch),
        inversePatchJson: json(input.inversePatch),
        ...actorColumns(actor),
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
      },
    })
    const updated = await tx.workspaceSession.updateMany({
      where: {
        id: workspaceId,
        headWorkspaceRevision: record.headWorkspaceRevision,
        status: "ACTIVE",
      },
      data: {
        headWorkspaceRevision: record.headWorkspaceRevision + 1,
        headGraphJson: json(after),
        lastAccessAt: now,
        expiresAt: leaseExpiry(now),
      },
    })
    if (updated.count !== 1) throw new WorkspaceRevisionConflictError()
    return mapRevision(revision)
  })
}

export async function appendWorkspaceMessage(
  context: AuthContext,
  workspaceId: string,
  input: {
    role: TargetWorkspaceMessage["role"]
    content: string
    agentRunId?: string
  },
  now = new Date()
) {
  const workspace = await ownedWorkspace(context, workspaceId, {
    agentRuns: true,
  })
  if (!workspace) return null
  await requireActiveWorkspace(workspace, now)
  if (input.role === "SYSTEM") {
    throw new WorkspaceInputError(
      "SYSTEM messages require a trusted internal writer"
    )
  }
  if (input.role === "USER" && input.agentRunId) {
    throw new WorkspaceInputError("USER messages cannot bind an Agent run")
  }
  if (input.role === "ASSISTANT" && !input.agentRunId) {
    throw new WorkspaceInputError(
      "ASSISTANT messages require a same-Workspace Agent run"
    )
  }
  if (
    input.agentRunId &&
    !workspace.agentRuns.some((run) => run.id === input.agentRunId)
  ) {
    throw new WorkspaceInputError(
      "Workspace message Agent run must belong to the same Workspace"
    )
  }
  const record = await prisma.workspaceMessage.create({
    data: {
      workspaceId,
      role: input.role,
      content: input.content,
      agentRunId: input.agentRunId ?? null,
    },
  })
  return targetWorkspaceMessageSchema.parse({
    ...record,
    agentRunId: record.agentRunId ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}

export async function createWorkspaceSuggestion(
  context: AuthContext,
  workspaceId: string,
  input: {
    title: string
    summary: string
    commandPayloads: unknown[]
    basedOnWorkspaceRevision: number
  },
  now = new Date()
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return null
  await requireActiveWorkspace(workspace, now)
  if (input.basedOnWorkspaceRevision !== workspace.headWorkspaceRevision) {
    throw new WorkspaceRevisionConflictError()
  }
  const record = await prisma.workspaceSuggestion.create({
    data: {
      workspaceId,
      title: input.title.trim(),
      summary: input.summary,
      commandPayloadsJson: json(input.commandPayloads),
      basedOnWorkspaceRevision: input.basedOnWorkspaceRevision,
    },
  })
  return targetWorkspaceSuggestionSchema.parse({
    ...record,
    commandPayloads: input.commandPayloads,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}

export async function startWorkspaceAgentRun(
  context: AuthContext,
  workspaceId: string,
  now = new Date()
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return null
  await requireActiveWorkspace(workspace, now)
  const record = await prisma.workspaceAgentRun.create({
    data: {
      workspaceId,
      status: "RUNNING",
      startedAt: now,
    },
  })
  return targetWorkspaceAgentRunSchema.parse({
    ...record,
    startedAt: record.startedAt.toISOString(),
    completedAt: record.completedAt?.toISOString(),
    errorCode: record.errorCode ?? undefined,
    errorMessage: record.errorMessage ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}

export async function finishWorkspaceAgentRun(
  context: AuthContext,
  workspaceId: string,
  runId: string,
  input: {
    status: Exclude<TargetWorkspaceAgentRun["status"], "RUNNING">
    errorCode?: string
    errorMessage?: string
    now?: Date
  }
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return null
  await requireActiveWorkspace(workspace, input.now ?? new Date())
  const updated = await prisma.workspaceAgentRun.updateMany({
    where: { id: runId, workspaceId, status: "RUNNING" },
    data: {
      status: input.status,
      completedAt: input.now ?? new Date(),
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
    },
  })
  if (updated.count !== 1) {
    throw new WorkspaceRevisionConflictError("Agent run is already terminal")
  }
  const record = await prisma.workspaceAgentRun.findUnique({
    where: { id: runId },
  })
  return record
    ? targetWorkspaceAgentRunSchema.parse({
        ...record,
        startedAt: record.startedAt.toISOString(),
        completedAt: record.completedAt?.toISOString(),
        errorCode: record.errorCode ?? undefined,
        errorMessage: record.errorMessage ?? undefined,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
      })
    : null
}

export async function forkWorkspace(
  context: AuthContext,
  workspaceId: string,
  now = new Date()
) {
  const document = await getWorkspaceDocument(context, workspaceId, now)
  if (!document) return null
  if (document.session.status !== "ACTIVE") {
    throw new WorkspaceInputError("Inactive Workspace cannot be forked")
  }
  return createWorkspace(context, {
    graph: document.session.headGraph,
    sourceJourneyId: document.session.sourceJourneyId ?? undefined,
    baseJourneyRevision: document.session.baseJourneyRevision ?? undefined,
    now,
  })
}

export async function archiveWorkspace(
  context: AuthContext,
  workspaceId: string,
  now = new Date()
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return false
  if (workspace.status === "ARCHIVED") return true
  await prisma.workspaceSession.update({
    where: { id: workspaceId },
    data: { status: "ARCHIVED", archivedAt: now },
  })
  return true
}

export async function expireInactiveWorkspaces(now = new Date()) {
  return prisma.workspaceSession.updateMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  })
}
