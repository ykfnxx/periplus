import { createHash, randomUUID } from "node:crypto"
import { z } from "zod"
import type { AuthContext } from "@/modules/auth/server/context"
import { isAdmin, PermissionDeniedError } from "@/modules/auth/server/context"
import {
  targetAssetSchema,
  targetEventObservationCreateSchema,
  targetEventObservationSchema,
  targetSourceDocumentSchema,
  targetSourceItemSchema,
  targetSourcePackSchema,
  type TargetContentBundle,
  type TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import {
  commitJourneyDomainGraph,
  getJourney,
  JourneyRevisionConflictError,
} from "@/modules/data/journeys/journey-repository"

type TargetAsset = TargetContentBundle["assets"][number]
type TargetEventAssetLink = TargetContentBundle["eventAssetLinks"][number]
type TargetEventObservation = TargetContentBundle["observations"][number]
type TargetSourcePack = TargetContentBundle["sourcePacks"][number]
type TargetSourceDocument = TargetContentBundle["sourceDocuments"][number]
type TargetSourceItem = TargetContentBundle["sourceItems"][number]
type TargetEventSourceLink = TargetContentBundle["eventSourceLinks"][number]

export class ContentInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ContentInputError"
  }
}

function stableId(prefix: string, ...parts: string[]) {
  const digest = createHash("sha256").update(parts.join("\0")).digest("hex")
  return `${prefix}-${digest.slice(0, 32)}`
}

function iso(value: Date | null | undefined) {
  return value?.toISOString()
}

function mapAsset(record: {
  id: string
  ownerId: string
  kind: TargetAsset["kind"]
  visibility: TargetAsset["visibility"]
  storageKey: string
  originalName: string | null
  mimeType: string
  sizeBytes: number
  checksum: string
  capturedAt: Date | null
  lat: number | null
  lng: number | null
  createdAt: Date
  deletedAt: Date | null
}): TargetAsset {
  return targetAssetSchema.parse({
    id: record.id,
    ownerId: record.ownerId,
    kind: record.kind,
    visibility: record.visibility,
    storageKey: record.storageKey,
    originalName: record.originalName ?? undefined,
    mimeType: record.mimeType,
    sizeBytes: record.sizeBytes,
    checksum: record.checksum,
    capturedAt: iso(record.capturedAt),
    lat: record.lat ?? undefined,
    lng: record.lng ?? undefined,
    createdAt: record.createdAt.toISOString(),
    deletedAt: iso(record.deletedAt),
  })
}

function writeEnvelope(
  context: AuthContext,
  graph: TargetJourneyGraphSnapshot,
  operation: string,
  idempotencyKey: string,
  patch: unknown[],
  inversePatch: unknown[]
) {
  return {
    graph,
    operation,
    idempotencyKey,
    patch,
    inversePatch,
    actor: { kind: "USER" as const, userId: context.userId },
  }
}

function activeEvent(graph: TargetJourneyGraphSnapshot, eventId: string) {
  const event = graph.events.find((candidate) => candidate.id === eventId)
  if (!event || event.retiredRevision) {
    throw new ContentInputError(`active Journey Event ${eventId} not found`)
  }
  return event
}

function assertExpectedRevision(
  graph: TargetJourneyGraphSnapshot,
  expectedRevision: number
) {
  if (graph.revision !== expectedRevision) {
    throw new JourneyRevisionConflictError()
  }
}

export async function createAsset(
  context: AuthContext,
  input: {
    id?: string
    kind: TargetAsset["kind"]
    visibility?: TargetAsset["visibility"]
    storageKey: string
    originalName?: string
    mimeType: string
    sizeBytes: number
    checksum: string
    capturedAt?: string
    lat?: number
    lng?: number
  }
) {
  const parsed = targetAssetSchema.omit({ createdAt: true }).parse({
    ...input,
    id: input.id ?? randomUUID(),
    ownerId: context.userId,
    visibility: input.visibility ?? "PRIVATE",
  })
  const record = await prisma.asset.create({
    data: {
      id: parsed.id,
      ownerId: parsed.ownerId,
      kind: parsed.kind,
      visibility: parsed.visibility,
      storageKey: parsed.storageKey,
      originalName: parsed.originalName ?? null,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.sizeBytes,
      checksum: parsed.checksum,
      capturedAt: parsed.capturedAt ? new Date(parsed.capturedAt) : null,
      lat: parsed.lat ?? null,
      lng: parsed.lng ?? null,
    },
  })
  return mapAsset(record)
}

export async function listAssets(
  context: AuthContext,
  options: {
    ownerId?: string
    kind?: TargetAsset["kind"]
    includeDeleted?: boolean
  } = {}
): Promise<TargetAsset[]> {
  const ownerId = options.ownerId ?? context.userId
  if (!isAdmin(context) && ownerId !== context.userId) {
    throw new PermissionDeniedError("Cannot list another user's assets")
  }
  const records = await prisma.asset.findMany({
    where: {
      ownerId,
      ...(options.kind ? { kind: options.kind } : {}),
      ...(options.includeDeleted ? {} : { deletedAt: null }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  })
  return records.map(mapAsset)
}

export async function getAsset(
  context: AuthContext,
  assetId: string,
  includeDeleted = false
) {
  const record = await prisma.asset.findUnique({ where: { id: assetId } })
  if (!record || (!includeDeleted && record.deletedAt)) return null
  if (
    !isAdmin(context) &&
    record.ownerId !== context.userId &&
    record.visibility !== "PUBLIC"
  ) {
    return null
  }
  return mapAsset(record)
}

export async function deleteAsset(context: AuthContext, assetId: string) {
  const record = await prisma.asset.findUnique({ where: { id: assetId } })
  if (!record) return false
  if (!isAdmin(context) && record.ownerId !== context.userId) {
    throw new PermissionDeniedError("Cannot delete another user's asset")
  }
  if (record.deletedAt) return true
  await prisma.asset.update({
    where: { id: assetId },
    data: { deletedAt: new Date() },
  })
  return true
}

export async function attachAssetToEvent(
  context: AuthContext,
  journeyId: string,
  input: {
    eventId: string
    assetId: string
    role: TargetEventAssetLink["role"]
    rank?: number
    caption?: string
    visibility?: TargetEventAssetLink["visibility"]
    expectedRevision: number
    idempotencyKey: string
  }
) {
  const current = await getJourney(context, journeyId)
  if (!current) return null
  activeEvent(current, input.eventId)

  const id = stableId(
    "event-asset-link",
    journeyId,
    input.eventId,
    input.idempotencyKey
  )
  const replay = current.eventAssetLinks.find((link) => link.id === id)
  if (replay) {
    if (
      replay.eventId !== input.eventId ||
      replay.assetId !== input.assetId ||
      replay.role !== input.role ||
      replay.caption !== (input.caption?.trim() || undefined) ||
      replay.visibility !== (input.visibility ?? "PRIVATE")
    ) {
      throw new ContentInputError(
        "Asset attachment idempotency key has another payload"
      )
    }
    return current
  }
  assertExpectedRevision(current, input.expectedRevision)

  const assetRecord = await prisma.asset.findUnique({
    where: { id: input.assetId },
  })
  if (!assetRecord || assetRecord.deletedAt) {
    throw new ContentInputError("active Asset not found")
  }
  if (
    assetRecord.ownerId !== current.ownerId &&
    assetRecord.visibility !== "PUBLIC"
  ) {
    throw new PermissionDeniedError("Asset cannot be linked to this Journey")
  }
  const visibility = input.visibility ?? "PRIVATE"
  const visibilityRank = { PRIVATE: 0, JOURNEY: 1, PUBLIC: 2 } as const
  if (visibilityRank[visibility] > visibilityRank[assetRecord.visibility]) {
    throw new ContentInputError("Event link cannot broaden Asset visibility")
  }

  const rank =
    input.rank ??
    Math.max(
      -1,
      ...current.eventAssetLinks
        .filter(
          (link) =>
            link.eventId === input.eventId &&
            link.role === input.role &&
            !link.retiredRevision
        )
        .map((link) => link.rank)
    ) + 1
  const link: TargetEventAssetLink = {
    id,
    journeyId,
    eventId: input.eventId,
    assetId: assetRecord.id,
    assetChecksum: assetRecord.checksum,
    role: input.role,
    rank,
    caption: input.caption?.trim() || undefined,
    visibility,
    introducedRevision: current.revision + 1,
    createdAt: new Date().toISOString(),
  }
  const next = structuredClone(current)
  next.revision += 1
  next.eventAssetLinks.push(link)
  return commitJourneyDomainGraph(
    context,
    journeyId,
    writeEnvelope(
      context,
      next,
      "journey.attach_asset",
      input.idempotencyKey,
      [{ op: "add", path: "/eventAssetLinks/-", value: link }],
      [{ op: "remove", path: `/eventAssetLinks/${link.id}` }]
    ),
    input.expectedRevision,
    "CONTENT"
  )
}

export async function addEventObservation(
  context: AuthContext,
  journeyId: string,
  input: z.input<typeof targetEventObservationCreateSchema> & {
    eventId: string
    expectedRevision: number
    idempotencyKey: string
  }
) {
  const current = await getJourney(context, journeyId)
  if (!current) return null
  activeEvent(current, input.eventId)

  const parsed = targetEventObservationCreateSchema.parse({
    kind: input.kind,
    phase: input.phase,
    observedAt: input.observedAt,
    supersedesId: input.supersedesId,
    visibility: input.visibility,
    ...(input.kind === "NOTE" || input.kind === "FACT"
      ? { body: input.body }
      : { value: input.value, body: input.body }),
  })
  const id = stableId(
    "event-observation",
    journeyId,
    input.eventId,
    input.idempotencyKey
  )
  const replay = current.observations.find(
    (observation) => observation.id === id
  )
  if (replay) {
    const expected = {
      kind: parsed.kind,
      phase: parsed.phase,
      body: parsed.body,
      value: "value" in parsed ? parsed.value : undefined,
      supersedesId: parsed.supersedesId,
      visibility: parsed.visibility,
    }
    const actual = {
      kind: replay.kind,
      phase: replay.phase,
      body: replay.body,
      value: "value" in replay ? replay.value : undefined,
      supersedesId: replay.supersedesId,
      visibility: replay.visibility,
    }
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new ContentInputError(
        "Observation idempotency key has another payload"
      )
    }
    return current
  }
  assertExpectedRevision(current, input.expectedRevision)
  const timestamp = new Date().toISOString()
  const observation = targetEventObservationSchema.parse({
    ...parsed,
    id,
    eventId: input.eventId,
    observedAt: parsed.observedAt ?? timestamp,
    actor: { kind: "USER", userId: context.userId },
    createdAt: timestamp,
  }) as TargetEventObservation
  const next = structuredClone(current)
  next.revision += 1
  next.observations.push(observation)
  return commitJourneyDomainGraph(
    context,
    journeyId,
    writeEnvelope(
      context,
      next,
      "journey.add_observation",
      input.idempotencyKey,
      [{ op: "add", path: "/observations/-", value: observation }],
      [{ op: "remove", path: `/observations/${observation.id}` }]
    ),
    input.expectedRevision,
    "CONTENT"
  )
}

export async function createSourcePack(
  context: AuthContext,
  input: {
    id?: string
    title: string
    visibility?: TargetSourcePack["visibility"]
  }
): Promise<TargetSourcePack> {
  const parsed = targetSourcePackSchema
    .pick({ id: true, ownerId: true, title: true, visibility: true })
    .parse({
      id: input.id ?? randomUUID(),
      ownerId: context.userId,
      title: input.title,
      visibility: input.visibility ?? "PRIVATE",
    })
  const record = await prisma.sourcePack.create({
    data: {
      id: parsed.id,
      ownerId: parsed.ownerId,
      title: parsed.title,
      visibility: parsed.visibility,
    },
  })
  return targetSourcePackSchema.parse({
    id: record.id,
    ownerId: record.ownerId,
    title: record.title,
    visibility: record.visibility,
    status: record.status,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    archivedAt: iso(record.archivedAt),
  })
}

export async function createSourceDocument(
  context: AuthContext,
  input: {
    id?: string
    sourcePackId: string
    assetId: string
    title: string
    pageCount?: number
  }
): Promise<TargetSourceDocument> {
  const parsed = targetSourceDocumentSchema
    .pick({
      id: true,
      sourcePackId: true,
      assetId: true,
      title: true,
      pageCount: true,
    })
    .parse({
      id: input.id ?? randomUUID(),
      sourcePackId: input.sourcePackId,
      assetId: input.assetId,
      title: input.title,
      pageCount: input.pageCount,
    })
  const pack = await prisma.sourcePack.findFirst({
    where: {
      id: parsed.sourcePackId,
      ...(isAdmin(context) ? {} : { ownerId: context.userId }),
    },
  })
  if (!pack) throw new ContentInputError("SourcePack not found")
  const asset = await prisma.asset.findFirst({
    where: { id: parsed.assetId, ownerId: pack.ownerId, deletedAt: null },
  })
  if (!asset) {
    throw new ContentInputError("SourceDocument requires an owned active Asset")
  }
  const record = await prisma.sourceDocument.create({
    data: {
      id: parsed.id,
      sourcePackId: pack.id,
      assetId: asset.id,
      checksum: asset.checksum,
      title: parsed.title,
      pageCount: parsed.pageCount ?? null,
    },
  })
  return targetSourceDocumentSchema.parse({
    id: record.id,
    sourcePackId: record.sourcePackId,
    assetId: record.assetId,
    checksum: record.checksum,
    title: record.title,
    pageCount: record.pageCount ?? undefined,
    processingStatus: record.processingStatus,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}

export async function createSourceItem(
  context: AuthContext,
  input: {
    id?: string
    sourceDocumentId: string
    kind: TargetSourceItem["kind"]
    title: string
    body?: string
    sourceOrder: number
    page?: string
    confidence: number
  }
): Promise<TargetSourceItem> {
  const parsed = targetSourceItemSchema
    .pick({
      id: true,
      sourceDocumentId: true,
      kind: true,
      title: true,
      body: true,
      sourceOrder: true,
      page: true,
      confidence: true,
    })
    .parse({
      id: input.id ?? randomUUID(),
      sourceDocumentId: input.sourceDocumentId,
      kind: input.kind,
      title: input.title,
      body: input.body,
      sourceOrder: input.sourceOrder,
      page: input.page,
      confidence: input.confidence,
    })
  const document = await prisma.sourceDocument.findFirst({
    where: {
      id: parsed.sourceDocumentId,
      sourcePack: {
        ...(isAdmin(context) ? {} : { ownerId: context.userId }),
      },
    },
  })
  if (!document) throw new ContentInputError("SourceDocument not found")
  const record = await prisma.sourceItem.create({
    data: {
      id: parsed.id,
      sourceDocumentId: document.id,
      kind: parsed.kind,
      title: parsed.title,
      body: parsed.body ?? null,
      sourceOrder: parsed.sourceOrder,
      page: parsed.page ?? null,
      confidence: parsed.confidence,
    },
  })
  return targetSourceItemSchema.parse({
    id: record.id,
    sourceDocumentId: record.sourceDocumentId,
    kind: record.kind,
    title: record.title,
    body: record.body ?? undefined,
    sourceOrder: record.sourceOrder,
    page: record.page ?? undefined,
    confidence: record.confidence,
    resolutionState: record.resolutionState,
    resolvedPlaceId: record.resolvedPlaceId ?? undefined,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  })
}

export async function linkSourceItemToEvent(
  context: AuthContext,
  journeyId: string,
  input: {
    eventId: string
    sourceItemId: string
    role: TargetEventSourceLink["role"]
    excerpt?: string
    page?: string
    confidence: number
    rank?: number
    approvedForJourneySharing?: boolean
    expectedRevision: number
    idempotencyKey: string
  }
) {
  const current = await getJourney(context, journeyId)
  if (!current) return null
  activeEvent(current, input.eventId)
  const id = stableId(
    "event-source-link",
    journeyId,
    input.eventId,
    input.idempotencyKey
  )
  const replay = current.eventSourceLinks.find((link) => link.id === id)
  if (replay) {
    if (
      replay.eventId !== input.eventId ||
      replay.sourceItemId !== input.sourceItemId ||
      replay.role !== input.role ||
      replay.excerpt !== (input.excerpt?.trim() || undefined) ||
      replay.page !== (input.page?.trim() || undefined) ||
      replay.confidence !== input.confidence ||
      replay.approvedForJourneySharing !==
        (input.approvedForJourneySharing ?? false)
    ) {
      throw new ContentInputError(
        "Source link idempotency key has another payload"
      )
    }
    return current
  }
  assertExpectedRevision(current, input.expectedRevision)
  const item = await prisma.sourceItem.findUnique({
    where: { id: input.sourceItemId },
    include: { sourceDocument: { include: { sourcePack: true } } },
  })
  if (!item) throw new ContentInputError("SourceItem not found")
  const pack = item.sourceDocument.sourcePack
  if (
    pack.ownerId !== current.ownerId &&
    !(
      pack.visibility === "SHARED" &&
      input.approvedForJourneySharing &&
      input.excerpt?.trim()
    )
  ) {
    throw new PermissionDeniedError(
      "External SourceItem requires a shared pack, explicit approval, and excerpt"
    )
  }

  const rank =
    input.rank ??
    Math.max(
      -1,
      ...current.eventSourceLinks
        .filter(
          (link) =>
            link.eventId === input.eventId &&
            link.role === input.role &&
            !link.retiredRevision
        )
        .map((link) => link.rank)
    ) + 1
  const link: TargetEventSourceLink = {
    id,
    journeyId,
    eventId: input.eventId,
    sourceItemId: item.id,
    sourceDocumentId: item.sourceDocument.id,
    sourceDocumentChecksum: item.sourceDocument.checksum,
    role: input.role,
    excerpt: input.excerpt?.trim() || undefined,
    page: input.page?.trim() || undefined,
    confidence: input.confidence,
    rank,
    approvedForJourneySharing: input.approvedForJourneySharing ?? false,
    introducedRevision: current.revision + 1,
    createdAt: new Date().toISOString(),
  }
  const next = structuredClone(current)
  next.revision += 1
  next.eventSourceLinks.push(link)
  return commitJourneyDomainGraph(
    context,
    journeyId,
    writeEnvelope(
      context,
      next,
      "journey.link_source_item",
      input.idempotencyKey,
      [{ op: "add", path: "/eventSourceLinks/-", value: link }],
      [{ op: "remove", path: `/eventSourceLinks/${link.id}` }]
    ),
    input.expectedRevision,
    "CONTENT"
  )
}
