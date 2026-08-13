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
  targetWorkspaceSummarySchema,
  targetWorkspaceMessageSchema,
  targetWorkspaceRevisionSchema,
  targetWorkspaceSessionSchema,
  targetWorkspaceTitleSchema,
  WORKSPACE_AGENT_RUN_LEASE_SECONDS,
  WORKSPACE_DEFAULT_TITLE,
  type TargetActorReference,
  type TargetJourneyGraphSnapshot,
  type TargetWorkspaceDocument,
  type TargetWorkspaceSummary,
  type TargetWorkspaceRevision,
  type TargetWorkspaceSession,
} from "@/modules/data-model/contracts"
import { projectFlatJourney } from "@/modules/data/journeys/flat-journey-projection"
import { prisma } from "@/modules/data/db/prisma"
import {
  commitJourneyRevisionChain,
  createJourneyRevisionChain,
  JourneyRevisionConflictError,
  type JourneyRevisionWrite,
} from "@/modules/data/journeys/journey-repository"
import {
  validateJourneyGraph,
  validateJourneyGraphTransition,
} from "@/modules/data/journeys/journey-graph-validator"

export class WorkspaceInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WorkspaceInputError"
  }
}

export class WorkspaceArchivedError extends Error {
  constructor(message = "Workspace is archived") {
    super(message)
    this.name = "WorkspaceArchivedError"
  }
}

export class WorkspaceRunningError extends Error {
  constructor(message = "Workspace has a running Agent") {
    super(message)
    this.name = "WorkspaceRunningError"
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
  agentRuns: {
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
} satisfies Prisma.WorkspaceSessionInclude

type WorkspaceRecord = Prisma.WorkspaceSessionGetPayload<{
  include: typeof workspaceInclude
}>

const workspaceHistorySelect = {
  id: true,
  sourceJourneyId: true,
  title: true,
  updatedAt: true,
  messages: {
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { content: true },
  },
} satisfies Prisma.WorkspaceSessionSelect

type WorkspaceHistoryRecord = Prisma.WorkspaceSessionGetPayload<{
  select: typeof workspaceHistorySelect
}>

type TargetWorkspaceMessage = z.infer<typeof targetWorkspaceMessageSchema>
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
  "journey.apply_draft": "JOURNEY_APPLY_DRAFT",
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

function isSQLiteBusy(error: unknown) {
  return (
    hasPrismaCode(error, "P2034") ||
    (error instanceof Error &&
      /SQLITE_BUSY|database is locked|write conflict/i.test(error.message))
  )
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
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

function forkBaseAdvance(revision: WorkspaceRecord["revisions"][number]) {
  try {
    const patch = JSON.parse(revision.patchJson) as unknown
    const entry = Array.isArray(patch) ? patch[0] : patch
    if (!entry || typeof entry !== "object") return undefined
    const value = entry as {
      op?: unknown
      revision?: unknown
      outcome?: {
        type?: unknown
        baseJourneyRevision?: unknown
        committedJourneyRevision?: unknown
      }
    }
    if (
      value.op === "workspace.refresh_base" &&
      typeof value.revision === "number"
    ) {
      return value.revision
    }
    if (
      value.outcome?.type === "workspace.committed" &&
      typeof value.outcome.committedJourneyRevision === "number"
    ) {
      return value.outcome.committedJourneyRevision
    }
    if (
      value.outcome?.type === "workspace.refreshed" &&
      typeof value.outcome.baseJourneyRevision === "number" &&
      revision.beforeGraphJson !== revision.afterGraphJson
    ) {
      return value.outcome.baseJourneyRevision
    }
    return undefined
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

async function assertWorkspaceActor(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  workspaceId: string,
  actor: TargetActorReference
) {
  if (actor.kind === "USER") {
    if (actor.userId !== context.userId) {
      throw new WorkspaceInputError(
        "Workspace USER actor must be authenticated"
      )
    }
    return
  }
  if (actor.kind === "SYSTEM") {
    throw new WorkspaceInputError(
      "SYSTEM Workspace writes require a trusted internal writer"
    )
  }
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

function mapSession(record: WorkspaceRecord): TargetWorkspaceSession {
  const headGraph = parseGraph(
    record.headGraphJson,
    `Workspace ${record.id} head`
  )
  return targetWorkspaceSessionSchema.parse({
    id: record.id,
    ownerId: record.ownerId,
    sourceJourneyId: record.sourceJourneyId,
    baseJourneyRevision: record.baseJourneyRevision,
    headWorkspaceRevision: record.headWorkspaceRevision,
    status: record.status,
    title: record.title,
    headGraph,
    flatJourney: projectFlatJourney(headGraph, record.headWorkspaceRevision),
    lastAccessAt: record.lastAccessAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    archivedAt: record.archivedAt?.toISOString(),
  })
}

function mapWorkspaceHistoryEntry(
  record: WorkspaceHistoryRecord
): TargetWorkspaceSummary {
  const latestMessage = [...record.messages]
    .reverse()
    .find((message) => message.content.trim())
  return targetWorkspaceSummarySchema.parse({
    id: record.id,
    sourceJourneyId: record.sourceJourneyId,
    title: record.title,
    preview: latestMessage?.content.trim().slice(0, 96) ?? "",
    updatedAt: record.updatedAt.toISOString(),
  })
}

function normalizeWorkspaceTitle(title: string) {
  const parsed = targetWorkspaceTitleSchema.safeParse(title)
  if (!parsed.success) {
    throw new WorkspaceInputError("Workspace title must be 1 to 48 characters")
  }
  return parsed.data
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
    blocks: JSON.parse(record.blocksJson),
    agentRunId: record.agentRunId ?? undefined,
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

async function assertWorkspaceSourceCurrent(
  tx: Prisma.TransactionClient,
  record: Pick<
    WorkspaceRecord,
    "ownerId" | "sourceJourneyId" | "baseJourneyRevision"
  >
) {
  if (!record.sourceJourneyId) return
  if (record.baseJourneyRevision === null) {
    throw new WorkspaceRevisionConflictError(
      "Workspace source Journey is stale; refresh, fork, or replay"
    )
  }
  const source = await tx.journey.findUnique({
    where: { id: record.sourceJourneyId },
    select: { ownerId: true, revision: true },
  })
  if (
    !source ||
    source.ownerId !== record.ownerId ||
    source.revision !== record.baseJourneyRevision
  ) {
    throw new WorkspaceRevisionConflictError(
      "Workspace source Journey is stale; refresh, fork, or replay"
    )
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

async function touchWorkspace(record: WorkspaceRecord, now: Date) {
  if (record.status !== "ACTIVE") return record
  if (record.lastAccessAt >= now) return record
  return prisma.workspaceSession.update({
    where: { id: record.id },
    data: { lastAccessAt: now },
    include: workspaceInclude,
  })
}

async function requireActiveWorkspace(
  record: {
    id: string
    status: TargetWorkspaceSession["status"]
    lastAccessAt: Date
  },
  now: Date
) {
  if (record.status !== "ACTIVE") {
    throw new WorkspaceInputError("Workspace is not active")
  }
  if (record.lastAccessAt < now) {
    await prisma.workspaceSession.updateMany({
      where: { id: record.id, status: "ACTIVE" },
      data: { lastAccessAt: now },
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
      title: input.sourceJourneyId
        ? normalizeWorkspaceTitle(graph.title.slice(0, 48))
        : WORKSPACE_DEFAULT_TITLE,
      headGraphJson: json(graph),
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
  const record = await touchWorkspace(found as WorkspaceRecord, now)
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
    accessState: "OWNER",
    draftState,
    messages: record.messages.map(mapMessage),
    agentRuns: record.agentRuns.map(mapAgentRun),
  })
}

export async function listWorkspaceHistory(
  context: AuthContext
): Promise<TargetWorkspaceSummary[]> {
  const records = await prisma.workspaceSession.findMany({
    where: { ownerId: context.userId, status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    select: workspaceHistorySelect,
  })
  return records.map(mapWorkspaceHistoryEntry)
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
    baseJourneyRevision?: number
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

  const result = await prisma.$transaction(async (tx) => {
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
      return {
        revision: mapRevision(existing),
        replayedFromIdempotencyKey: true,
      }
    }
    if (record.status !== "ACTIVE") {
      throw new WorkspaceInputError("Workspace is not active")
    }
    if (record.headWorkspaceRevision !== input.expectedRevision) {
      throw new WorkspaceRevisionConflictError()
    }
    if (input.commandName.startsWith("journey.")) {
      await assertWorkspaceSourceCurrent(tx, record)
    }
    await assertWorkspaceActor(tx, context, workspaceId, actor)

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
    if (input.baseJourneyRevision !== undefined) {
      if (!record.sourceJourneyId) {
        throw new WorkspaceInputError(
          "Only a source-backed Workspace can refresh its base"
        )
      }
      const sourceJourney = await tx.journey.findUnique({
        where: { id: record.sourceJourneyId },
        select: { ownerId: true, revision: true },
      })
      if (
        !sourceJourney ||
        sourceJourney.ownerId !== record.ownerId ||
        sourceJourney.revision !== input.baseJourneyRevision
      ) {
        throw new WorkspaceRevisionConflictError(
          "Workspace refresh base is no longer the canonical Journey head"
        )
      }
      const base = await tx.journeyRevision.findUnique({
        where: {
          journeyId_revision: {
            journeyId: record.sourceJourneyId,
            revision: input.baseJourneyRevision,
          },
        },
        select: { snapshotJson: true },
      })
      if (!base || base.snapshotJson !== json(after)) {
        throw new WorkspaceInputError(
          "Refreshed Workspace head must match its exact Journey base snapshot"
        )
      }
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
        ...(input.baseJourneyRevision !== undefined
          ? { baseJourneyRevision: input.baseJourneyRevision }
          : {}),
        lastAccessAt: now,
      },
    })
    if (updated.count !== 1) throw new WorkspaceRevisionConflictError()
    return {
      revision: mapRevision(revision),
      replayedFromIdempotencyKey: false,
    }
  })
  return result
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

export async function getWorkspaceAgentContextCheckpoint(
  context: AuthContext,
  workspaceId: string
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (
    !workspace?.agentContextStatus ||
    !workspace.agentContextThroughMessageId ||
    !workspace.agentContextSourceRunId
  ) {
    return null
  }
  return {
    status: workspace.agentContextStatus,
    summary: workspace.agentContextSummary ?? undefined,
    throughMessageId: workspace.agentContextThroughMessageId,
    sourceRunId: workspace.agentContextSourceRunId,
    attemptCount: workspace.agentContextAttemptCount,
    error: workspace.agentContextLastError ?? undefined,
    updatedAt: workspace.agentContextUpdatedAt?.toISOString(),
  }
}

async function requireCheckpointBoundary(
  context: AuthContext,
  workspaceId: string,
  sourceRunId: string,
  throughMessageId: string,
  now = new Date()
) {
  const workspace = await ownedWorkspace(context, workspaceId, {
    agentRuns: true,
  })
  if (!workspace) return null
  await requireActiveWorkspace(workspace, now)
  const message = await prisma.workspaceMessage.findFirst({
    where: {
      id: throughMessageId,
      workspaceId,
      role: "ASSISTANT",
      agentRunId: sourceRunId,
    },
    select: { id: true },
  })
  if (!message) {
    throw new WorkspaceInputError(
      "Agent context checkpoint must end at its source run assistant message"
    )
  }
  const run = workspace.agentRuns.find(
    (candidate) => candidate.id === sourceRunId
  )
  if (!run || run.status === "RUNNING") {
    throw new WorkspaceInputError(
      "Agent context checkpoint requires a terminal source run"
    )
  }
  return workspace
}

export async function startWorkspaceAgentContextCheckpointAttempt(
  context: AuthContext,
  workspaceId: string,
  checkpoint: { sourceRunId: string; throughMessageId: string },
  now = new Date()
) {
  const workspace = await requireCheckpointBoundary(
    context,
    workspaceId,
    checkpoint.sourceRunId,
    checkpoint.throughMessageId,
    now
  )
  if (!workspace) return null
  const sameSource =
    workspace.agentContextSourceRunId === checkpoint.sourceRunId &&
    workspace.agentContextThroughMessageId === checkpoint.throughMessageId
  const attemptCount = sameSource ? workspace.agentContextAttemptCount + 1 : 1
  if (attemptCount > 2) {
    throw new WorkspaceInputError("SUMMARY_UNAVAILABLE")
  }
  const updated = await prisma.workspaceSession.updateMany({
    where: {
      id: workspaceId,
      agentContextSourceRunId: workspace.agentContextSourceRunId,
      agentContextThroughMessageId: workspace.agentContextThroughMessageId,
      agentContextAttemptCount: workspace.agentContextAttemptCount,
    },
    data: {
      // Keep the last READY business memory as input for the new checkpoint.
      // Its PENDING/FAILED status prevents it from being consumed by an Agent
      // run as though it were current.
      agentContextSummary: workspace.agentContextSummary,
      agentContextThroughMessageId: checkpoint.throughMessageId,
      agentContextSourceRunId: checkpoint.sourceRunId,
      agentContextStatus: "PENDING",
      agentContextAttemptCount: attemptCount,
      agentContextLastError: null,
      agentContextUpdatedAt: now,
      lastAccessAt: now,
    },
  })
  if (updated.count !== 1) {
    throw new WorkspaceInputError("Agent context checkpoint attempt raced")
  }
  return { ...checkpoint, status: "PENDING" as const, attemptCount }
}

export async function saveWorkspaceAgentContextCheckpoint(
  context: AuthContext,
  workspaceId: string,
  checkpoint: {
    sourceRunId: string
    throughMessageId: string
    summary: string
    attemptCount: number
  },
  now = new Date()
) {
  const workspace = await requireCheckpointBoundary(
    context,
    workspaceId,
    checkpoint.sourceRunId,
    checkpoint.throughMessageId,
    now
  )
  if (!workspace) return null
  const updated = await prisma.workspaceSession.updateMany({
    where: {
      id: workspaceId,
      agentContextSourceRunId: checkpoint.sourceRunId,
      agentContextThroughMessageId: checkpoint.throughMessageId,
      agentContextStatus: "PENDING",
      agentContextAttemptCount: checkpoint.attemptCount,
    },
    data: {
      agentContextSummary: checkpoint.summary,
      agentContextStatus: "READY",
      agentContextLastError: null,
      agentContextUpdatedAt: now,
      lastAccessAt: now,
    },
  })
  if (updated.count !== 1) {
    throw new WorkspaceInputError("Agent context checkpoint attempt is stale")
  }
  return { ...checkpoint, status: "READY" as const }
}

export async function failWorkspaceAgentContextCheckpoint(
  context: AuthContext,
  workspaceId: string,
  checkpoint: {
    sourceRunId: string
    throughMessageId: string
    error: string
    attemptCount: number
  },
  now = new Date()
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return null
  const updated = await prisma.workspaceSession.updateMany({
    where: {
      id: workspaceId,
      agentContextSourceRunId: checkpoint.sourceRunId,
      agentContextThroughMessageId: checkpoint.throughMessageId,
      agentContextStatus: "PENDING",
      agentContextAttemptCount: checkpoint.attemptCount,
    },
    data: {
      agentContextStatus: "FAILED",
      agentContextLastError: checkpoint.error,
      agentContextUpdatedAt: now,
      lastAccessAt: now,
    },
  })
  if (updated.count !== 1) return null
  return { ...checkpoint, status: "FAILED" as const }
}

export async function appendWorkspaceMessage(
  context: AuthContext,
  workspaceId: string,
  input: {
    role: TargetWorkspaceMessage["role"]
    content: string
    blocks?: TargetWorkspaceMessage["blocks"]
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
    const session = await tx.workspaceSession.findUnique({
      where: { id: workspaceId },
      select: { status: true, title: true },
    })
    if (!session || session.status !== "ACTIVE") {
      throw new WorkspaceInputError("Workspace is not active")
    }
    const title = input.role === "USER" ? input.content.trim().slice(0, 48) : ""
    const existingUserMessage = title
      ? await tx.workspaceMessage.findFirst({
          where: { workspaceId, role: "USER" },
          select: { id: true },
        })
      : null
    await tx.workspaceSession.update({
      where: { id: workspaceId },
      data: {
        lastAccessAt: now,
        ...(session.title === WORKSPACE_DEFAULT_TITLE &&
        title &&
        !existingUserMessage
          ? { title }
          : {}),
      },
    })
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
        blocksJson: json(input.blocks ?? []),
        agentRunId: input.agentRunId ?? null,
      },
    })
  })
  return targetWorkspaceMessageSchema.parse({
    ...record,
    blocks: JSON.parse(record.blocksJson),
    agentRunId: record.agentRunId ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}

export async function appendWorkspaceMessageDelta(
  context: AuthContext,
  workspaceId: string,
  messageId: string,
  agentRunId: string,
  text: string,
  now = new Date()
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return null
  await requireActiveWorkspace(workspace, now)
  let record:
    | {
        id: string
        workspaceId: string
        role: string
        content: string
        blocksJson: string
        agentRunId: string | null
        createdAt: Date
        updatedAt: Date
      }
    | undefined
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      record = await prisma.$transaction(async (tx) => {
        const active = await tx.workspaceSession.updateMany({
          where: { id: workspaceId, status: "ACTIVE" },
          data: { lastAccessAt: now },
        })
        if (active.count !== 1) {
          throw new WorkspaceInputError("Workspace is not active")
        }
        const message = await tx.workspaceMessage.findFirst({
          where: {
            id: messageId,
            workspaceId,
            agentRunId,
            role: "ASSISTANT",
          },
        })
        if (!message) {
          throw new WorkspaceInputError(
            "Assistant message does not belong to Agent run"
          )
        }
        return tx.workspaceMessage.update({
          where: { id: messageId },
          data: { content: `${message.content}${text}` },
        })
      })
      break
    } catch (error) {
      if (!isSQLiteBusy(error) || attempt === 3) throw error
      await wait(25 * 2 ** (attempt - 1))
    }
  }
  if (!record) throw new Error("Workspace message delta was not persisted")
  return targetWorkspaceMessageSchema.parse({
    id: record.id,
    workspaceId: record.workspaceId,
    role: record.role,
    content: record.content,
    blocks: JSON.parse(record.blocksJson),
    agentRunId: record.agentRunId ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}

export async function startWorkspaceAgentRun(
  context: AuthContext,
  workspaceId: string,
  now = new Date(),
  runtimeOwnerId = `direct-${context.userId}`,
  leaseSeconds = WORKSPACE_AGENT_RUN_LEASE_SECONDS,
  runId = randomUUID()
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return null
  await requireActiveWorkspace(workspace, now)
  let record
  try {
    record = await prisma.$transaction(async (tx) => {
      const active = await tx.workspaceSession.updateMany({
        where: { id: workspaceId, status: "ACTIVE" },
        data: { lastAccessAt: now },
      })
      if (active.count !== 1) {
        throw new WorkspaceInputError("Workspace is not active")
      }
      return tx.workspaceAgentRun.create({
        data: {
          id: runId,
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

export async function forkWorkspaceRevisionChain(
  context: AuthContext,
  workspaceId: string,
  input: {
    expectedRevision: number
    fromWorkspaceRevision: number
    forkWorkspaceId: string
    patch: unknown
    inversePatch: unknown
    idempotencyKey: string
    actor: TargetActorReference
    now?: Date
  }
) {
  const now = input.now ?? new Date()
  const result = await prisma.$transaction(async (tx) => {
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
        existing.commandName !== commandNames["workspace.fork"] ||
        json(commandEnvelopeFromPatch(existing.patchJson)) !==
          json(commandEnvelopeFromPatch(input.patch))
      ) {
        throw new WorkspaceIdempotencyConflictError()
      }
      const fork = await tx.workspaceSession.findUnique({
        where: { id: input.forkWorkspaceId },
        include: workspaceInclude,
      })
      if (!fork) {
        throw new WorkspaceRevisionConflictError(
          "Fork outcome is missing its Workspace"
        )
      }
      return {
        revision: mapRevision(existing),
        fork: mapSession(fork),
        replayedFromIdempotencyKey: true,
      }
    }
    if (record.status !== "ACTIVE") {
      throw new WorkspaceInputError("Workspace is not active")
    }
    if (record.headWorkspaceRevision !== input.expectedRevision) {
      throw new WorkspaceRevisionConflictError()
    }
    if (
      input.fromWorkspaceRevision < 0 ||
      input.fromWorkspaceRevision > input.expectedRevision
    ) {
      throw new WorkspaceInputError(
        "Fork revision must belong to the current Workspace history"
      )
    }
    await assertWorkspaceActor(tx, context, workspaceId, input.actor)

    const initialGraph = record.revisions[0]
      ? parseGraph(
          record.revisions[0].beforeGraphJson,
          `Workspace ${workspaceId} fork initial graph`
        )
      : parseGraph(record.headGraphJson, `Workspace ${workspaceId} head`)
    let forkBaseJourneyRevision = record.sourceJourneyId
      ? initialGraph.revision
      : null
    let materialAfterWorkspaceRevision = 0
    for (const revision of record.revisions) {
      if (revision.revision > input.fromWorkspaceRevision) break
      const advancedBase = forkBaseAdvance(revision)
      if (advancedBase !== undefined) {
        forkBaseJourneyRevision = advancedBase
        materialAfterWorkspaceRevision = revision.revision
      }
    }
    const copied = record.revisions.filter(
      (revision) =>
        revision.revision > materialAfterWorkspaceRevision &&
        revision.revision <= input.fromWorkspaceRevision &&
        contractCommandNames[revision.commandName].startsWith("journey.") &&
        parseGraph(
          revision.beforeGraphJson,
          `WorkspaceRevision ${revision.id} before`
        ).revision !==
          parseGraph(
            revision.afterGraphJson,
            `WorkspaceRevision ${revision.id} after`
          ).revision
    )
    let canonicalBaseGraph: TargetJourneyGraphSnapshot | null = null
    if (record.sourceJourneyId && forkBaseJourneyRevision !== null) {
      const base = await tx.journeyRevision.findUnique({
        where: {
          journeyId_revision: {
            journeyId: record.sourceJourneyId,
            revision: forkBaseJourneyRevision,
          },
        },
        select: { snapshotJson: true },
      })
      if (!base) {
        throw new WorkspaceRevisionConflictError(
          "Fork base Journey revision is missing"
        )
      }
      canonicalBaseGraph = parseGraph(
        base.snapshotJson,
        `Journey ${record.sourceJourneyId} revision ${forkBaseJourneyRevision}`
      )
    }
    const baseGraph =
      canonicalBaseGraph ??
      (copied[0]
        ? parseGraph(
            copied[0].beforeGraphJson,
            `Workspace ${workspaceId} fork base`
          )
        : initialGraph)

    await tx.workspaceSession.create({
      data: {
        id: input.forkWorkspaceId,
        ownerId: record.ownerId,
        sourceJourneyId: record.sourceJourneyId,
        baseJourneyRevision: forkBaseJourneyRevision,
        headGraphJson: json(baseGraph),
        lastAccessAt: now,
        createdAt: now,
      },
    })
    let parentRevisionId: string | null = null
    let forkBefore = baseGraph
    for (const [index, sourceRevision] of copied.entries()) {
      const forkRevision = index + 1
      const id = randomUUID()
      const idempotencyKey = `fork:${workspaceId}:${sourceRevision.idempotencyKey}`
      const sourceBefore = parseGraph(
        sourceRevision.beforeGraphJson,
        `WorkspaceRevision ${sourceRevision.id} before`
      )
      const forkAfter = parseGraph(
        sourceRevision.afterGraphJson,
        `WorkspaceRevision ${sourceRevision.id} after`
      )
      const priorSelections = new Map(
        forkBefore.branchSelections.map((selection) => [
          selection.id,
          selection,
        ])
      )
      forkAfter.branchSelections = forkAfter.branchSelections.map(
        (selection) =>
          priorSelections.get(selection.id) ?? {
            ...selection,
            actor: { kind: "USER" as const, userId: context.userId },
          }
      )
      const priorObservations = new Map(
        forkBefore.observations.map((observation) => [
          observation.id,
          observation,
        ])
      )
      forkAfter.observations = forkAfter.observations.map(
        (observation) =>
          priorObservations.get(observation.id) ?? {
            ...observation,
            actor: { kind: "USER" as const, userId: context.userId },
          }
      )
      if (forkBefore.revision !== sourceBefore.revision) {
        throw new WorkspaceRevisionConflictError(
          "Forked Workspace graph history is not revision-continuous"
        )
      }
      validateJourneyGraphTransition(forkBefore, forkAfter)
      const patch = JSON.parse(sourceRevision.patchJson) as unknown
      if (Array.isArray(patch) && patch[0] && typeof patch[0] === "object") {
        const entry = patch[0] as { commandEnvelope?: Record<string, unknown> }
        if (entry.commandEnvelope) {
          entry.commandEnvelope = {
            ...entry.commandEnvelope,
            aggregateId: input.forkWorkspaceId,
            expectedRevision: forkRevision - 1,
            idempotencyKey,
            actor: { kind: "USER", userId: context.userId },
          }
        }
      }
      await tx.workspaceRevision.create({
        data: {
          id,
          workspaceId: input.forkWorkspaceId,
          revision: forkRevision,
          parentRevisionId,
          commandName: sourceRevision.commandName,
          beforeGraphJson: json(forkBefore),
          afterGraphJson: json(forkAfter),
          patchJson: json(patch),
          inversePatchJson: sourceRevision.inversePatchJson,
          actorKind: "USER",
          actorUserId: context.userId,
          actorAgentRunId: null,
          idempotencyKey,
          createdAt: sourceRevision.createdAt,
        },
      })
      await tx.workspaceSession.update({
        where: { id: input.forkWorkspaceId },
        data: {
          headWorkspaceRevision: forkRevision,
          headGraphJson: json(forkAfter),
        },
      })
      parentRevisionId = id
      forkBefore = forkAfter
    }

    const sourceParent = record.revisions.find(
      (revision) => revision.revision === input.expectedRevision
    )
    const control = await tx.workspaceRevision.create({
      data: {
        id: randomUUID(),
        workspaceId,
        revision: input.expectedRevision + 1,
        parentRevisionId: sourceParent?.id ?? null,
        commandName: commandNames["workspace.fork"],
        beforeGraphJson: record.headGraphJson,
        afterGraphJson: record.headGraphJson,
        patchJson: json(input.patch),
        inversePatchJson: json(input.inversePatch),
        ...actorColumns(input.actor),
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
      },
    })
    const advanced = await tx.workspaceSession.updateMany({
      where: {
        id: workspaceId,
        headWorkspaceRevision: input.expectedRevision,
        status: "ACTIVE",
      },
      data: {
        headWorkspaceRevision: input.expectedRevision + 1,
        lastAccessAt: now,
      },
    })
    if (advanced.count !== 1) throw new WorkspaceRevisionConflictError()
    const fork = await tx.workspaceSession.findUniqueOrThrow({
      where: { id: input.forkWorkspaceId },
      include: workspaceInclude,
    })
    return {
      revision: mapRevision(control),
      fork: mapSession(fork),
      replayedFromIdempotencyKey: false,
    }
  })
  return result
}

export async function refreshWorkspaceRevisionChain(
  context: AuthContext,
  workspaceId: string,
  input: {
    expectedRevision: number
    canonicalBase: TargetJourneyGraphSnapshot
    replays: Array<{
      commandName: TargetWorkspaceRevision["commandName"]
      before: TargetJourneyGraphSnapshot
      after: TargetJourneyGraphSnapshot
      patch: unknown
      inversePatch: unknown
      actor: TargetActorReference
      sourceRevisionId: string
    }>
    patch: unknown
    inversePatch: unknown
    idempotencyKey: string
    actor: TargetActorReference
    now?: Date
  }
) {
  const now = input.now ?? new Date()
  const canonicalBase = validateJourneyGraph(input.canonicalBase)
  const result = await prisma.$transaction(async (tx) => {
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
        existing.commandName !== commandNames["workspace.refresh"] ||
        json(commandEnvelopeFromPatch(existing.patchJson)) !==
          json(commandEnvelopeFromPatch(input.patch))
      ) {
        throw new WorkspaceIdempotencyConflictError()
      }
      return {
        revision: mapRevision(existing),
        replayedFromIdempotencyKey: true,
      }
    }
    if (record.status !== "ACTIVE") {
      throw new WorkspaceInputError("Workspace is not active")
    }
    if (
      record.headWorkspaceRevision !== input.expectedRevision ||
      !record.sourceJourneyId
    ) {
      throw new WorkspaceRevisionConflictError()
    }
    await assertWorkspaceActor(tx, context, workspaceId, input.actor)
    const canonical = await tx.journeyRevision.findUnique({
      where: {
        journeyId_revision: {
          journeyId: record.sourceJourneyId,
          revision: canonicalBase.revision,
        },
      },
      select: { snapshotJson: true },
    })
    const sourceJourney = await tx.journey.findUnique({
      where: { id: record.sourceJourneyId },
      select: { ownerId: true, revision: true },
    })
    if (
      !sourceJourney ||
      sourceJourney.ownerId !== record.ownerId ||
      sourceJourney.revision !== canonicalBase.revision ||
      !canonical ||
      canonical.snapshotJson !== json(canonicalBase)
    ) {
      throw new WorkspaceRevisionConflictError(
        "Workspace refresh base is no longer the canonical Journey head"
      )
    }

    let workspaceRevision = input.expectedRevision
    let parentRevisionId =
      record.revisions.find(
        (revision) => revision.revision === input.expectedRevision
      )?.id ?? null
    let headGraph = parseGraph(
      record.headGraphJson,
      `Workspace ${workspaceId} head`
    )
    const append = async (revisionInput: {
      commandName: TargetWorkspaceRevision["commandName"]
      before: TargetJourneyGraphSnapshot
      after: TargetJourneyGraphSnapshot
      patch: unknown
      inversePatch: unknown
      actor: TargetActorReference
      idempotencyKey: string
    }) => {
      workspaceRevision += 1
      const id = randomUUID()
      const created = await tx.workspaceRevision.create({
        data: {
          id,
          workspaceId,
          revision: workspaceRevision,
          parentRevisionId,
          commandName: commandNames[revisionInput.commandName],
          beforeGraphJson: json(revisionInput.before),
          afterGraphJson: json(revisionInput.after),
          patchJson: json(revisionInput.patch),
          inversePatchJson: json(revisionInput.inversePatch),
          ...actorColumns(revisionInput.actor),
          idempotencyKey: revisionInput.idempotencyKey,
          createdAt: now,
        },
      })
      await tx.workspaceSession.update({
        where: { id: workspaceId },
        data: {
          headWorkspaceRevision: workspaceRevision,
          headGraphJson: json(revisionInput.after),
        },
      })
      parentRevisionId = id
      headGraph = revisionInput.after
      return created
    }

    const refreshBaseIdempotencyKey = `refresh-base:${randomUUID()}`
    await append({
      commandName: "workspace.refresh",
      before: headGraph,
      after: canonicalBase,
      patch: [
        { op: "workspace.refresh_base", revision: canonicalBase.revision },
      ],
      inversePatch: [{ op: "workspace.restore_stale_head" }],
      actor: input.actor,
      idempotencyKey: refreshBaseIdempotencyKey,
    })
    for (const replay of input.replays) {
      const replayIdempotencyKey = `refresh-replay:${randomUUID()}:${replay.sourceRevisionId}`
      const patch = structuredClone(replay.patch)
      if (Array.isArray(patch) && patch[0] && typeof patch[0] === "object") {
        const entry = patch[0] as { commandEnvelope?: Record<string, unknown> }
        if (entry.commandEnvelope) {
          entry.commandEnvelope = {
            ...entry.commandEnvelope,
            aggregateId: workspaceId,
            expectedRevision: workspaceRevision,
            idempotencyKey: replayIdempotencyKey,
          }
        }
      }
      await append({
        commandName: replay.commandName,
        before: replay.before,
        after: replay.after,
        patch,
        inversePatch: replay.inversePatch,
        actor: replay.actor,
        idempotencyKey: replayIdempotencyKey,
      })
    }
    const control = await append({
      commandName: "workspace.refresh",
      before: headGraph,
      after: headGraph,
      patch: input.patch,
      inversePatch: input.inversePatch,
      actor: input.actor,
      idempotencyKey: input.idempotencyKey,
    })
    await tx.workspaceSession.update({
      where: { id: workspaceId },
      data: {
        baseJourneyRevision: canonicalBase.revision,
        lastAccessAt: now,
      },
    })
    return {
      revision: mapRevision(control),
      replayedFromIdempotencyKey: false,
    }
  })
  return result
}

export async function commitWorkspaceRevisionChain(
  context: AuthContext,
  workspaceId: string,
  input: {
    expectedRevision: number
    expectedJourneyRevision: number | null
    patch: unknown
    inversePatch: unknown
    idempotencyKey: string
    actor: TargetActorReference
    now?: Date
  }
) {
  const now = input.now ?? new Date()
  const result = await prisma.$transaction(async (tx) => {
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
        existing.commandName !== commandNames["workspace.commit"] ||
        json(commandEnvelopeFromPatch(existing.patchJson)) !==
          json(commandEnvelopeFromPatch(input.patch))
      ) {
        throw new WorkspaceIdempotencyConflictError()
      }
      return {
        revision: mapRevision(existing),
        replayedFromIdempotencyKey: true,
      }
    }
    if (record.status !== "ACTIVE") {
      throw new WorkspaceInputError("Workspace is not active")
    }
    if (record.headWorkspaceRevision !== input.expectedRevision) {
      throw new WorkspaceRevisionConflictError()
    }
    await assertWorkspaceSourceCurrent(tx, record)
    await assertWorkspaceActor(tx, context, workspaceId, input.actor)
    if (record.sourceJourneyId && input.expectedJourneyRevision === null) {
      throw new JourneyRevisionConflictError(
        "Existing Journey Workspace requires an expected Journey revision"
      )
    }
    if (!record.sourceJourneyId && input.expectedJourneyRevision !== null) {
      throw new JourneyRevisionConflictError(
        "Scratch Workspace commit must expect no Journey revision"
      )
    }
    if (
      record.sourceJourneyId &&
      record.baseJourneyRevision !== null &&
      input.expectedJourneyRevision !== null
    ) {
      const canonicalBase = await tx.journeyRevision.findUnique({
        where: {
          journeyId_revision: {
            journeyId: record.sourceJourneyId,
            revision: input.expectedJourneyRevision,
          },
        },
        select: { snapshotJson: true },
      })
      const workspaceBaseJson =
        input.expectedJourneyRevision === record.baseJourneyRevision
          ? await tx.journeyRevision
              .findUnique({
                where: {
                  journeyId_revision: {
                    journeyId: record.sourceJourneyId,
                    revision: record.baseJourneyRevision,
                  },
                },
                select: { snapshotJson: true },
              })
              .then((revision) => revision?.snapshotJson)
          : record.revisions.find(
              (revision) =>
                parseGraph(
                  revision.afterGraphJson,
                  `WorkspaceRevision ${revision.id} after`
                ).revision === input.expectedJourneyRevision
            )?.afterGraphJson
      if (
        !canonicalBase ||
        !workspaceBaseJson ||
        canonicalBase.snapshotJson !== workspaceBaseJson
      ) {
        throw new JourneyRevisionConflictError(
          "Workspace commit base does not match the canonical Journey"
        )
      }
    }

    const alreadyCommitted = await tx.journeyRevision.findMany({
      where: {
        workspaceRevisionId: {
          in: record.revisions.map((revision) => revision.id),
        },
      },
      select: { workspaceRevisionId: true },
    })
    const committedIds = new Set(
      alreadyCommitted.flatMap((revision) =>
        revision.workspaceRevisionId ? [revision.workspaceRevisionId] : []
      )
    )
    const expectedGraphRevision = input.expectedJourneyRevision ?? 1
    const baseAdvanceWorkspaceRevision = record.sourceJourneyId
      ? Math.max(
          0,
          ...record.revisions
            .filter(
              (revision) =>
                forkBaseAdvance(revision) === record.baseJourneyRevision
            )
            .map((revision) => revision.revision)
        )
      : 0
    const candidates = record.revisions.filter(
      (revision) =>
        revision.revision <= input.expectedRevision &&
        revision.revision > baseAdvanceWorkspaceRevision &&
        !committedIds.has(revision.id) &&
        contractCommandNames[revision.commandName].startsWith("journey.") &&
        parseGraph(
          revision.afterGraphJson,
          `WorkspaceRevision ${revision.id} after`
        ).revision > expectedGraphRevision &&
        parseGraph(
          revision.beforeGraphJson,
          `WorkspaceRevision ${revision.id} before`
        ).revision !==
          parseGraph(
            revision.afterGraphJson,
            `WorkspaceRevision ${revision.id} after`
          ).revision
    )
    if (candidates.length === 0 && record.sourceJourneyId) {
      throw new WorkspaceInputError(
        "Workspace has no uncommitted graph revisions"
      )
    }
    const writes: JourneyRevisionWrite[] = candidates.map((revision) => ({
      graph: parseGraph(
        revision.afterGraphJson,
        `WorkspaceRevision ${revision.id} after`
      ),
      operation: contractCommandNames[revision.commandName],
      patch: JSON.parse(revision.patchJson) as unknown[],
      inversePatch: JSON.parse(revision.inversePatchJson) as unknown[],
      actor: actorFromRecord(revision),
      idempotencyKey: `workspace:${workspaceId}:${revision.id}`,
      workspaceRevisionId: revision.id,
    }))
    const scratchBase = record.revisions[0]
      ? parseGraph(
          record.revisions[0].beforeGraphJson,
          `Workspace ${workspaceId} scratch base`
        )
      : parseGraph(record.headGraphJson, `Workspace ${workspaceId} head`)
    const committed = record.sourceJourneyId
      ? await commitJourneyRevisionChain(
          context,
          record.sourceJourneyId,
          writes,
          input.expectedJourneyRevision!,
          tx
        )
      : await createJourneyRevisionChain(
          context,
          {
            graph: scratchBase,
            operation: "workspace.commit.create",
            patch: [],
            inversePatch: [],
            actor: { kind: "USER", userId: context.userId },
            idempotencyKey: `workspace:${workspaceId}:create`,
          },
          writes,
          tx
        )
    if (!committed) {
      throw new WorkspaceInputError("Workspace source Journey was not found")
    }
    const committedHeadJson = json(committed)

    const sourceParent = record.revisions.find(
      (revision) => revision.revision === input.expectedRevision
    )
    const control = await tx.workspaceRevision.create({
      data: {
        id: randomUUID(),
        workspaceId,
        revision: input.expectedRevision + 1,
        parentRevisionId: sourceParent?.id ?? null,
        commandName: commandNames["workspace.commit"],
        beforeGraphJson: record.headGraphJson,
        afterGraphJson: committedHeadJson,
        patchJson: json(input.patch),
        inversePatchJson: json(input.inversePatch),
        ...actorColumns(input.actor),
        idempotencyKey: input.idempotencyKey,
        createdAt: now,
      },
    })
    const advanced = await tx.workspaceSession.updateMany({
      where: {
        id: workspaceId,
        headWorkspaceRevision: input.expectedRevision,
        status: "ACTIVE",
      },
      data: {
        headWorkspaceRevision: input.expectedRevision + 1,
        sourceJourneyId: committed.id,
        baseJourneyRevision: committed.revision,
        headGraphJson: committedHeadJson,
        lastAccessAt: now,
      },
    })
    if (advanced.count !== 1) throw new WorkspaceRevisionConflictError()
    return {
      revision: mapRevision(control),
      replayedFromIdempotencyKey: false,
    }
  })
  return result
}

export async function archiveWorkspace(
  context: AuthContext,
  workspaceId: string,
  now = new Date()
) {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return false
  return prisma.$transaction(async (tx) => {
    const current = await tx.workspaceSession.findUnique({
      where: { id: workspaceId },
      select: { status: true },
    })
    if (!current) return false
    if (current.status === "ARCHIVED") throw new WorkspaceArchivedError()
    const running = await tx.workspaceAgentRun.findFirst({
      where: { workspaceId, status: "RUNNING" },
      select: { id: true },
    })
    if (running) throw new WorkspaceRunningError()
    await tx.workspaceSession.update({
      where: { id: workspaceId },
      data: { status: "ARCHIVED", archivedAt: now },
    })
    return true
  })
}

export async function renameWorkspace(
  context: AuthContext,
  workspaceId: string,
  title: string,
  now = new Date()
): Promise<TargetWorkspaceSummary | null> {
  const workspace = await ownedWorkspace(context, workspaceId, {})
  if (!workspace) return null
  const normalizedTitle = normalizeWorkspaceTitle(title)
  return prisma.$transaction(async (tx) => {
    const current = await tx.workspaceSession.findUnique({
      where: { id: workspaceId },
      select: { status: true },
    })
    if (!current) return null
    if (current.status === "ARCHIVED") throw new WorkspaceArchivedError()
    const running = await tx.workspaceAgentRun.findFirst({
      where: { workspaceId, status: "RUNNING" },
      select: { id: true },
    })
    if (running) throw new WorkspaceRunningError()
    const updated = await tx.workspaceSession.update({
      where: { id: workspaceId },
      data: { title: normalizedTitle, lastAccessAt: now },
      select: workspaceHistorySelect,
    })
    return mapWorkspaceHistoryEntry(updated)
  })
}
