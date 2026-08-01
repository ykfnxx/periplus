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
  WORKSPACE_AGENT_RUN_LEASE_SECONDS,
  type TargetActorReference,
  type TargetJourneyGraphSnapshot,
  type TargetWorkspaceDocument,
  type TargetWorkspaceRevision,
  type TargetWorkspaceSession,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import { validateJourneyGraph } from "@/modules/data/journeys/journey-graph-validator"

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

function hasPrismaCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  )
}

function commandEnvelopeFromPatch(value: string | unknown) {
  try {
    const patch = typeof value === "string" ? JSON.parse(value) : value
    if (!patch || typeof patch !== "object") return undefined
    const entry = Array.isArray(patch) ? patch[0] : patch
    return entry && typeof entry === "object"
      ? (entry as { commandEnvelope?: unknown }).commandEnvelope
      : undefined
  } catch {
    return undefined
  }
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
    runtimeOwnerId: record.runtimeOwnerId ?? undefined,
    heartbeatAt: record.heartbeatAt?.toISOString(),
    leaseExpiresAt: record.leaseExpiresAt?.toISOString(),
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
    return prisma.$transaction(async (tx) => {
      await tx.workspaceSession.updateMany({
        where: { id: record.id, status: "ACTIVE", expiresAt: { lte: now } },
        data: { status: "EXPIRED" },
      })
      await tx.workspaceAgentRun.updateMany({
        where: { workspaceId: record.id, status: "RUNNING" },
        data: {
          status: "FAILED",
          completedAt: now,
          leaseExpiresAt: null,
          errorCode: "WORKSPACE_EXPIRED",
          errorMessage: "Workspace expired while the Agent run was active",
        },
      })
      return tx.workspaceSession.findUniqueOrThrow({
        where: { id: record.id },
        include: workspaceInclude,
      })
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
      await prisma.$transaction(async (tx) => {
        await tx.workspaceSession.updateMany({
          where: { id: record.id, status: "ACTIVE", expiresAt: { lte: now } },
          data: { status: "EXPIRED" },
        })
        await tx.workspaceAgentRun.updateMany({
          where: { workspaceId: record.id, status: "RUNNING" },
          data: {
            status: "FAILED",
            completedAt: now,
            leaseExpiresAt: null,
            errorCode: "WORKSPACE_EXPIRED",
            errorMessage: "Workspace expired while the Agent run was active",
          },
        })
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
  let graph = validateJourneyGraph(input.graph)
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
    const source = await prisma.journeyRevision.findUnique({
      where: {
        journeyId_revision: {
          journeyId: input.sourceJourneyId,
          revision: input.baseJourneyRevision!,
        },
      },
      select: {
        snapshotJson: true,
        journey: { select: { ownerId: true, deletedAt: true } },
      },
    })
    if (
      !source ||
      source.journey.ownerId !== graph.ownerId ||
      source.journey.deletedAt
    ) {
      throw new WorkspaceInputError("source Journey base revision not found")
    }
    const canonicalBase = parseGraph(
      source.snapshotJson,
      `Journey ${input.sourceJourneyId} revision ${input.baseJourneyRevision}`
    )
    if (json(canonicalBase) !== json(graph)) {
      throw new WorkspaceInputError(
        "source Workspace graph must match its base Journey revision snapshot"
      )
    }
    graph = canonicalBase
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
  const sourceJourney = session.sourceJourneyId
    ? await prisma.journey.findUnique({
        where: { id: session.sourceJourneyId },
        select: { revision: true },
      })
    : null
  const baseGraph =
    session.sourceJourneyId && session.baseJourneyRevision !== null
      ? await prisma.journeyRevision
          .findUnique({
            where: {
              journeyId_revision: {
                journeyId: session.sourceJourneyId,
                revision: session.baseJourneyRevision,
              },
            },
            select: { snapshotJson: true },
          })
          .then((revision) =>
            revision
              ? parseGraph(
                  revision.snapshotJson,
                  `Journey ${session.sourceJourneyId} revision ${session.baseJourneyRevision}`
                )
              : null
          )
      : record.revisions[0]
        ? parseGraph(
            record.revisions[0].beforeGraphJson,
            `Workspace ${workspaceId} initial graph`
          )
        : session.headGraph
  const draftState =
    session.status === "ACTIVE" &&
    sourceJourney &&
    session.baseJourneyRevision !== null &&
    sourceJourney.revision > session.baseJourneyRevision
      ? "STALE"
      : baseGraph && json(baseGraph) === json(session.headGraph)
        ? "CLEAN"
        : "DIRTY"

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
  if (actor.kind === "USER" && actor.userId !== context.userId) {
    throw new WorkspaceInputError("Workspace USER actor must be authenticated")
  }
  if (actor.kind === "SYSTEM") {
    throw new WorkspaceInputError(
      "SYSTEM Workspace writes require a trusted internal writer"
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

    if (actor.kind === "AGENT") {
      const run = await tx.workspaceAgentRun.findUnique({
        where: { id: actor.agentRunId },
        select: { workspaceId: true, status: true },
      })
      if (!run || run.workspaceId !== workspaceId || run.status !== "RUNNING") {
        throw new WorkspaceInputError(
          "Workspace AGENT actor requires a running same-Workspace Agent run"
        )
      }
    }

    const existing = await tx.workspaceRevision.findUnique({
      where: {
        workspaceId_idempotencyKey: {
          workspaceId,
          idempotencyKey: input.idempotencyKey,
        },
      },
    })
    if (existing) {
      const existingEnvelope = commandEnvelopeFromPatch(existing.patchJson)
      const requestedEnvelope = commandEnvelopeFromPatch(input.patch)
      const sameTypedCommand =
        existingEnvelope !== undefined &&
        requestedEnvelope !== undefined &&
        json(existingEnvelope) === json(requestedEnvelope)
      const sameLegacyWrite =
        existing.afterGraphJson === json(after) &&
        existing.patchJson === json(input.patch) &&
        existing.inversePatchJson === json(input.inversePatch)
      if (
        existing.commandName !== commandNames[input.commandName] ||
        (!sameTypedCommand && !sameLegacyWrite)
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

export async function getWorkspaceRevision(
  context: AuthContext,
  workspaceId: string,
  revision: number
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return null
  const record = await prisma.workspaceRevision.findUnique({
    where: { workspaceId_revision: { workspaceId, revision } },
  })
  return record ? mapRevision(record) : null
}

export async function getWorkspaceRevisionByIdempotencyKey(
  context: AuthContext,
  workspaceId: string,
  idempotencyKey: string
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return null
  const record = await prisma.workspaceRevision.findUnique({
    where: {
      workspaceId_idempotencyKey: { workspaceId, idempotencyKey },
    },
  })
  return record ? mapRevision(record) : null
}

export async function listWorkspaceRevisions(
  context: AuthContext,
  workspaceId: string
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return null
  const records = await prisma.workspaceRevision.findMany({
    where: { workspaceId },
    orderBy: { revision: "asc" },
  })
  return records.map(mapRevision)
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
  const record = await prisma.$transaction(async (tx) => {
    const active = await tx.workspaceSession.updateMany({
      where: { id: workspaceId, status: "ACTIVE", expiresAt: { gt: now } },
      data: { lastAccessAt: now, expiresAt: leaseExpiry(now) },
    })
    if (active.count !== 1) {
      throw new WorkspaceInputError("Workspace is not active")
    }
    if (input.agentRunId) {
      const run = await tx.workspaceAgentRun.findFirst({
        where: { id: input.agentRunId, workspaceId },
        select: { id: true },
      })
      if (!run) {
        throw new WorkspaceInputError(
          "Workspace message Agent run must belong to the same Workspace"
        )
      }
    }
    return tx.workspaceMessage.create({
      data: {
        workspaceId,
        role: input.role,
        content: input.content,
        agentRunId: input.agentRunId ?? null,
      },
    })
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
  now = new Date(),
  runtimeOwnerId = `direct-${context.userId}`,
  leaseSeconds = WORKSPACE_AGENT_RUN_LEASE_SECONDS
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return null
  await requireActiveWorkspace(workspace, now)
  let record
  try {
    record = await prisma.$transaction(async (tx) => {
      const active = await tx.workspaceSession.updateMany({
        where: { id: workspaceId, status: "ACTIVE", expiresAt: { gt: now } },
        data: { lastAccessAt: now, expiresAt: leaseExpiry(now) },
      })
      if (active.count !== 1) {
        throw new WorkspaceInputError("Workspace is not active")
      }
      return tx.workspaceAgentRun.create({
        data: {
          workspaceId,
          status: "RUNNING",
          runtimeOwnerId,
          heartbeatAt: now,
          leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000),
          startedAt: now,
        },
      })
    })
  } catch (error) {
    if (hasPrismaCode(error, "P2002")) {
      throw new WorkspaceRevisionConflictError(
        "Workspace already has a running Agent"
      )
    }
    throw error
  }
  return targetWorkspaceAgentRunSchema.parse({
    ...record,
    runtimeOwnerId: record.runtimeOwnerId ?? undefined,
    heartbeatAt: record.heartbeatAt?.toISOString(),
    leaseExpiresAt: record.leaseExpiresAt?.toISOString(),
    startedAt: record.startedAt.toISOString(),
    completedAt: record.completedAt?.toISOString(),
    errorCode: record.errorCode ?? undefined,
    errorMessage: record.errorMessage ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}

export async function heartbeatWorkspaceAgentRun(
  context: AuthContext,
  workspaceId: string,
  runId: string,
  runtimeOwnerId: string,
  now = new Date(),
  leaseSeconds = WORKSPACE_AGENT_RUN_LEASE_SECONDS
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return null
  await requireActiveWorkspace(workspace, now)
  const updated = await prisma.workspaceAgentRun.updateMany({
    where: {
      id: runId,
      workspaceId,
      status: "RUNNING",
      runtimeOwnerId,
    },
    data: {
      heartbeatAt: now,
      leaseExpiresAt: new Date(now.getTime() + leaseSeconds * 1000),
    },
  })
  if (updated.count !== 1) {
    throw new WorkspaceRevisionConflictError(
      "Agent run lease is no longer owned by this runtime"
    )
  }
  return true
}

export async function reconcileExpiredWorkspaceAgentRun(
  context: AuthContext,
  workspaceId: string,
  runtimeOwnerId: string,
  now = new Date()
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return null
  await requireActiveWorkspace(workspace, now)
  const updated = await prisma.workspaceAgentRun.updateMany({
    where: {
      workspaceId,
      status: "RUNNING",
      leaseExpiresAt: { lte: now },
      OR: [
        { runtimeOwnerId: null },
        { runtimeOwnerId: { not: runtimeOwnerId } },
      ],
    },
    data: {
      status: "FAILED",
      completedAt: now,
      leaseExpiresAt: null,
      errorCode: "AGENT_RUN_ORPHANED",
      errorMessage: "Agent runtime lease expired before completion",
    },
  })
  return updated.count
}

export async function finishWorkspaceAgentRun(
  context: AuthContext,
  workspaceId: string,
  runId: string,
  input: {
    status: Exclude<TargetWorkspaceAgentRun["status"], "RUNNING">
    runtimeOwnerId?: string
    errorCode?: string
    errorMessage?: string
    now?: Date
  }
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return null
  const updated = await prisma.workspaceAgentRun.updateMany({
    where: {
      id: runId,
      workspaceId,
      status: "RUNNING",
      ...(input.runtimeOwnerId ? { runtimeOwnerId: input.runtimeOwnerId } : {}),
    },
    data: {
      status: input.status,
      completedAt: input.now ?? new Date(),
      leaseExpiresAt: null,
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
        runtimeOwnerId: record.runtimeOwnerId ?? undefined,
        heartbeatAt: record.heartbeatAt?.toISOString(),
        leaseExpiresAt: record.leaseExpiresAt?.toISOString(),
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
  return prisma.$transaction(async (tx) => {
    let baseGraph = document.session.headGraph
    if (
      document.session.sourceJourneyId &&
      document.session.baseJourneyRevision !== null
    ) {
      const source = await tx.journeyRevision.findUnique({
        where: {
          journeyId_revision: {
            journeyId: document.session.sourceJourneyId,
            revision: document.session.baseJourneyRevision,
          },
        },
        select: { snapshotJson: true },
      })
      if (!source) {
        throw new WorkspaceRevisionConflictError(
          "Workspace source base revision is missing"
        )
      }
      baseGraph = parseGraph(
        source.snapshotJson,
        `Journey ${document.session.sourceJourneyId} revision ${document.session.baseJourneyRevision}`
      )
    } else if (document.session.headWorkspaceRevision > 0) {
      const firstRevision = await tx.workspaceRevision.findUnique({
        where: {
          workspaceId_revision: { workspaceId, revision: 1 },
        },
        select: { beforeGraphJson: true },
      })
      if (!firstRevision) {
        throw new WorkspaceRevisionConflictError(
          "Workspace head has no persisted first revision"
        )
      }
      baseGraph = parseGraph(
        firstRevision.beforeGraphJson,
        `Workspace ${workspaceId} fork base`
      )
    }

    const forkId = randomUUID()
    const created = await tx.workspaceSession.create({
      data: {
        id: forkId,
        ownerId: document.session.ownerId,
        sourceJourneyId: document.session.sourceJourneyId,
        baseJourneyRevision: document.session.baseJourneyRevision,
        headGraphJson: json(baseGraph),
        expiresAt: leaseExpiry(now),
        lastAccessAt: now,
        createdAt: now,
      },
      include: workspaceInclude,
    })
    if (document.session.headWorkspaceRevision === 0) {
      return mapSession(created)
    }

    await tx.workspaceRevision.create({
      data: {
        id: randomUUID(),
        workspaceId: forkId,
        revision: 1,
        parentRevisionId: null,
        commandName: commandNames["workspace.fork"],
        beforeGraphJson: json(baseGraph),
        afterGraphJson: json(document.session.headGraph),
        patchJson: json([
          {
            op: "workspace.fork",
            forkedFromWorkspaceId: workspaceId,
            forkedFromWorkspaceRevision: document.session.headWorkspaceRevision,
          },
        ]),
        inversePatchJson: json([{ op: "workspace.restore_fork_base" }]),
        actorKind: "USER",
        actorUserId: context.userId,
        actorAgentRunId: null,
        idempotencyKey: `workspace-fork-${randomUUID()}`,
        createdAt: now,
      },
    })
    const updated = await tx.workspaceSession.update({
      where: { id: forkId },
      data: {
        headWorkspaceRevision: 1,
        headGraphJson: json(document.session.headGraph),
      },
      include: workspaceInclude,
    })
    return mapSession(updated)
  })
}

export async function archiveWorkspace(
  context: AuthContext,
  workspaceId: string,
  now = new Date()
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return false
  await prisma.$transaction(async (tx) => {
    if (workspace.status !== "ARCHIVED") {
      await tx.workspaceSession.update({
        where: { id: workspaceId },
        data: { status: "ARCHIVED", archivedAt: now },
      })
    }
    await tx.workspaceAgentRun.updateMany({
      where: { workspaceId, status: "RUNNING" },
      data: {
        status: "CANCELLED",
        completedAt: now,
        leaseExpiresAt: null,
      },
    })
  })
  return true
}

export async function expireInactiveWorkspaces(now = new Date()) {
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.workspaceSession.findMany({
      where: { status: "ACTIVE", expiresAt: { lte: now } },
      select: { id: true },
    })
    const workspaceIds = candidates.map((candidate) => candidate.id)
    if (workspaceIds.length === 0) return { count: 0 }
    const expired = await tx.workspaceSession.updateMany({
      where: {
        id: { in: workspaceIds },
        status: "ACTIVE",
        expiresAt: { lte: now },
      },
      data: { status: "EXPIRED" },
    })
    await tx.workspaceAgentRun.updateMany({
      where: { workspaceId: { in: workspaceIds }, status: "RUNNING" },
      data: {
        status: "FAILED",
        completedAt: now,
        leaseExpiresAt: null,
        errorCode: "WORKSPACE_EXPIRED",
        errorMessage: "Workspace expired while the Agent run was active",
      },
    })
    return expired
  })
}
