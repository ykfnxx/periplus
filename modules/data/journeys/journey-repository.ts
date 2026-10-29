import { createHash, randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import {
  isAdmin,
  PermissionDeniedError,
  type AuthContext,
} from "@/modules/auth/server/context"
import {
  journeySnapshotSchema,
  journeyRevisionSchema,
  type JourneySnapshot,
  type JourneyRevision,
  type JourneyCommand,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import { lockAssetRows } from "@/modules/data/assets/asset-repository"
import {
  journeyReadScope,
  assertJourneyCommandAccess,
} from "./recording-access"

export class JourneyInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "JourneyInputError"
  }
}
export class JourneyRevisionConflictError extends Error {
  constructor(message = "Journey was updated by another request") {
    super(message)
    this.name = "JourneyRevisionConflictError"
  }
}
export class JourneyIdempotencyConflictError extends Error {
  constructor(message = "Journey idempotency key has another payload") {
    super(message)
    this.name = "JourneyIdempotencyConflictError"
  }
}
export interface JourneyRevisionWrite {
  journey: JourneySnapshot
  operation: string
  patch: unknown
  inversePatch: unknown
  idempotencyKey: string
}
type Tx = Prisma.TransactionClient
const json = (value: unknown) => JSON.stringify(value)
export function journeyAssetIds(journey: JourneySnapshot) {
  return [
    ...new Set(
      journey.events.flatMap((event) =>
        [...event.photos, ...event.receipts].map((item) => item.assetId)
      )
    ),
  ]
}
export function canonicalJourney(input: JourneySnapshot): JourneySnapshot {
  const journey = journeySnapshotSchema.parse(input)
  journey.role = "OWNER"
  for (const event of journey.events) {
    event.canEdit = true
    event.canRemove = true
    for (const attachment of [...event.photos, ...event.receipts])
      attachment.canEdit = true
  }
  return journey
}
export function assertJourneyTransition(
  before: JourneySnapshot,
  after: JourneySnapshot
) {
  for (const event of before.events) {
    if (
      !event.executionStatus ||
      !["CONFIRMED", "SKIPPED", "CANCELLED"].includes(event.executionStatus)
    )
      continue
    const next = after.events.find((item) => item.id === event.id)
    if (
      !next ||
      next.executionStatus !== event.executionStatus ||
      next.actualStartAt !== event.actualStartAt ||
      next.actualEndAt !== event.actualEndAt
    )
      throw new JourneyInputError(
        "Confirmed execution facts cannot be removed or undone"
      )
  }
}
export async function presentJourney(
  context: AuthContext,
  input: JourneySnapshot,
  tx: Tx = prisma
): Promise<JourneySnapshot> {
  const journey = structuredClone(input)
  const manager = isAdmin(context) || journey.ownerId === context.userId
  const assets = await tx.asset.findMany({
    where: { id: { in: journeyAssetIds(journey) } },
    include: { owner: { select: { id: true, name: true, image: true } } },
  })
  const byAsset = new Map(assets.map((asset) => [asset.id, asset]))
  const users = await tx.user.findMany({
    where: { id: { in: journey.events.map((event) => event.source.userId) } },
    select: { id: true, name: true, image: true },
  })
  const byUser = new Map(users.map((user) => [user.id, user]))
  journey.role = manager ? "OWNER" : "MEMBER"
  for (const event of journey.events) {
    const user = byUser.get(event.source.userId)
    if (user)
      event.source = { userId: user.id, name: user.name, image: user.image }
    event.canEdit = manager || event.source.userId === context.userId
    for (const item of [...event.photos, ...event.receipts]) {
      const asset = byAsset.get(item.assetId)
      if (asset)
        item.source = {
          userId: asset.owner.id,
          name: asset.owner.name,
          image: asset.owner.image,
        }
      item.canEdit = manager || item.source.userId === context.userId
      item.url = `/api/assets/${encodeURIComponent(item.assetId)}/file`
    }
    event.canRemove =
      !["CONFIRMED", "SKIPPED", "CANCELLED"].includes(
        event.executionStatus ?? ""
      ) &&
      event.canEdit &&
      (manager ||
        [...event.photos, ...event.receipts].every(
          (item) => item.source.userId === context.userId
        ))
  }
  return journey
}
function mapRevision(
  record: Prisma.JourneyRevisionGetPayload<object>
): JourneyRevision {
  return journeyRevisionSchema.parse({
    id: record.id,
    journeyId: record.journeyId,
    revision: record.revision,
    operation: record.operation,
    snapshot: JSON.parse(record.snapshotJson),
    patch: JSON.parse(record.patchJson),
    inversePatch: JSON.parse(record.inversePatchJson),
    actor: { kind: "USER", userId: record.actorUserId },
    idempotencyKey: record.idempotencyKey,
    parentRevisionId: record.parentRevisionId ?? undefined,
    createdAt: record.createdAt.toISOString(),
  })
}
function signature(operation: string, patch: unknown, userId: string) {
  return json({ operation, patch, userId })
}
async function persistIndex(tx: Tx, journey: JourneySnapshot) {
  // These rows are read indexes for ownership and active asset access, rebuilt
  // only here from the same canonical snapshot; they are never a graph API.
  await tx.journeyEvent.deleteMany({ where: { journeyId: journey.id } })
  if (!journey.events.length) return
  await tx.journeyEvent.createMany({
    data: journey.events.map((event, rank) => ({
      id: event.id,
      journeyId: journey.id,
      rank,
      sourceUserId: event.source.userId,
    })),
  })
  const links = journey.events.flatMap((event) => [
    ...event.photos.map((photo, rank) => ({
      id: `photo-${createHash("sha256").update(`${event.id}:${photo.assetId}`).digest("hex")}`,
      journeyId: journey.id,
      eventId: event.id,
      assetId: photo.assetId,
      role: photo.isCover ? ("COVER" as const) : ("GALLERY" as const),
      rank,
    })),
    ...event.receipts.map((receipt, rank) => ({
      id: receipt.id,
      journeyId: journey.id,
      eventId: event.id,
      assetId: receipt.assetId,
      role: "RECEIPT" as const,
      rank,
    })),
  ])
  if (links.length) await tx.eventAssetLink.createMany({ data: links })
}
async function validateSourcesAndAssets(
  tx: Tx,
  context: AuthContext,
  before: JourneySnapshot | undefined,
  after: JourneySnapshot
) {
  const ids = journeyAssetIds(after)
  await lockAssetRows(tx, ids)
  const assets = await tx.asset.findMany({ where: { id: { in: ids } } })
  const previousAssets = new Set(before ? journeyAssetIds(before) : [])
  for (const event of after.events) {
    const previous = before?.events.find((item) => item.id === event.id)
    if (
      (previous && event.source.userId !== previous.source.userId) ||
      (!previous && event.source.userId !== context.userId)
    )
      throw new PermissionDeniedError(
        "Event source is immutable and server assigned"
      )
    for (const item of [...event.photos, ...event.receipts]) {
      const asset = assets.find((candidate) => candidate.id === item.assetId)
      if (
        !asset ||
        asset.deletedAt ||
        asset.kind !== "IMAGE" ||
        (!isAdmin(context) &&
          asset.ownerId !== context.userId &&
          !previousAssets.has(asset.id))
      )
        throw new PermissionDeniedError(
          "Image is not available to this Journey"
        )
      if (item.source.userId !== asset.ownerId)
        throw new PermissionDeniedError(
          "Attachment source must be its uploader"
        )
    }
  }
}
async function writeRevision(
  tx: Tx,
  context: AuthContext,
  write: JourneyRevisionWrite,
  before?: JourneySnapshot
) {
  const journey = canonicalJourney(write.journey)
  if (
    before &&
    (journey.id !== before.id ||
      journey.ownerId !== before.ownerId ||
      journey.revision !== before.revision + 1)
  )
    throw new JourneyInputError("Journey identity and next revision must match")
  if (!before && journey.revision !== 1)
    throw new JourneyInputError("New Journey starts at revision 1")
  if (before) assertJourneyTransition(before, journey)
  await validateSourcesAndAssets(tx, context, before, journey)
  const parent = before
    ? await tx.journeyRevision.findUniqueOrThrow({
        where: {
          journeyId_revision: {
            journeyId: journey.id,
            revision: before.revision,
          },
        },
        select: { id: true },
      })
    : null
  if (!before)
    await tx.journey.create({
      data: {
        id: journey.id,
        ownerId: journey.ownerId,
        revision: journey.revision,
        title: journey.title,
        description: journey.description,
        status: journey.status,
        visibility: journey.visibility,
        snapshotJson: json(journey),
        createdAt: new Date(journey.createdAt),
        updatedAt: new Date(journey.updatedAt),
      },
    })
  await tx.journeyRevision.create({
    data: {
      id: randomUUID(),
      journeyId: journey.id,
      revision: journey.revision,
      operation: write.operation,
      snapshotJson: json(journey),
      patchJson: json(write.patch),
      inversePatchJson: json(write.inversePatch),
      actorUserId: context.userId,
      idempotencyKey: write.idempotencyKey,
      parentRevisionId: parent?.id,
    },
  })
  if (before)
    await tx.journey.update({
      where: { id: journey.id },
      data: {
        revision: journey.revision,
        title: journey.title,
        description: journey.description,
        status: journey.status,
        visibility: journey.visibility,
        snapshotJson: json(journey),
        updatedAt: new Date(journey.updatedAt),
      },
    })
  await persistIndex(tx, journey)
  return journey
}
export async function listJourneys(
  context: AuthContext,
  options: { ownerId?: string } = {}
) {
  if (
    options.ownerId &&
    options.ownerId !== context.userId &&
    !isAdmin(context)
  )
    throw new PermissionDeniedError("Cannot list another user's Journeys")
  const rows = await prisma.journey.findMany({
    where: {
      deletedAt: null,
      ...journeyReadScope(context),
      ...(options.ownerId ? { ownerId: options.ownerId } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  })
  return Promise.all(
    rows.map((row) =>
      presentJourney(
        context,
        journeySnapshotSchema.parse(JSON.parse(row.snapshotJson))
      )
    )
  )
}
export async function getJourney(context: AuthContext, id: string) {
  const row = await prisma.journey.findFirst({
    where: { id, deletedAt: null, ...journeyReadScope(context) },
  })
  return row
    ? presentJourney(
        context,
        journeySnapshotSchema.parse(JSON.parse(row.snapshotJson))
      )
    : null
}
export async function createJourney(
  context: AuthContext,
  write: JourneyRevisionWrite
) {
  if (!isAdmin(context) && write.journey.ownerId !== context.userId)
    throw new PermissionDeniedError("Journey must belong to its writer")
  const run = async (transaction: Tx) => {
    const existing = await transaction.journeyRevision.findUnique({
      where: {
        journeyId_idempotencyKey: {
          journeyId: write.journey.id,
          idempotencyKey: write.idempotencyKey,
        },
      },
    })
    if (existing) {
      const revision = mapRevision(existing)
      if (
        signature(revision.operation, revision.patch, revision.actor.userId) !==
        signature(write.operation, write.patch, context.userId)
      )
        throw new JourneyIdempotencyConflictError()
      return revision.snapshot
    }
    if (
      await transaction.journey.findUnique({ where: { id: write.journey.id } })
    )
      throw new JourneyRevisionConflictError()
    return writeRevision(transaction, context, write)
  }
  try {
    return await prisma.$transaction(run)
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    )
      throw new JourneyRevisionConflictError()
    throw error
  }
}
export async function commitJourney(
  context: AuthContext,
  id: string,
  write: JourneyRevisionWrite,
  expectedRevision: number,
  command: JourneyCommand
) {
  const run = async (tx: Tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Journey" WHERE "id" = ${id} FOR UPDATE`
    const row = await tx.journey.findFirst({
      where: { id, deletedAt: null, ...journeyReadScope(context) },
    })
    if (!row) return null
    const replay = await tx.journeyRevision.findUnique({
      where: {
        journeyId_idempotencyKey: {
          journeyId: id,
          idempotencyKey: write.idempotencyKey,
        },
      },
    })
    if (replay) {
      const revision = mapRevision(replay)
      if (
        signature(revision.operation, revision.patch, revision.actor.userId) !==
        signature(write.operation, write.patch, context.userId)
      )
        throw new JourneyIdempotencyConflictError()
      return revision.snapshot
    }
    if (row.revision !== expectedRevision)
      throw new JourneyRevisionConflictError()
    const before = journeySnapshotSchema.parse(JSON.parse(row.snapshotJson))
    await assertJourneyCommandAccess(tx, context, before, command)
    return writeRevision(tx, context, write, before)
  }
  return prisma.$transaction(run)
}
export async function getJourneyRevisionByIdempotencyKey(
  context: AuthContext,
  id: string,
  idempotencyKey: string
) {
  if (
    !(await prisma.journey.findFirst({
      where: { id, deletedAt: null, ...journeyReadScope(context) },
      select: { id: true },
    }))
  )
    return null
  const row = await prisma.journeyRevision.findUnique({
    where: { journeyId_idempotencyKey: { journeyId: id, idempotencyKey } },
  })
  return row ? mapRevision(row) : null
}
