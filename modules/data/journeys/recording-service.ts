import { isAdmin } from "@/modules/auth/server/context"
import type { AuthContext } from "@/modules/auth/server/context"
import {
  recordingJourneyCreateSchema,
  recordingMutationSchema,
  type RecordingMutationResult,
  type TargetJourneyGraphSnapshot,
  type TargetJourneyRevision,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import { journeyInclude, mapJourneyToGraph } from "./journey-mapper"
import {
  createJourney,
  commitRecordingJourneyGraph,
  getJourney,
  getJourneyRevisionByIdempotencyKey,
  JourneyIdempotencyConflictError,
  JourneyRevisionConflictError,
} from "./journey-repository"
import {
  recordingChain,
  projectRecording,
  summarizeRecording,
} from "./recording-projection"
import { recordingId, reduceRecordingCore } from "./recording-reducer"
import { reduceRecordingPhotos } from "./recording-photos"
import { reduceRecordingReceipts } from "./recording-receipts"
import {
  assertRecordingCommandAccess,
  journeyReadScope,
} from "./recording-access"

export class RecordingNotFoundError extends Error {
  constructor() {
    super("Journey not found")
    this.name = "RecordingNotFoundError"
  }
}

async function document(
  context: AuthContext,
  graph: TargetJourneyGraphSnapshot
) {
  const [journey, revision] = await Promise.all([
    prisma.journey.findUniqueOrThrow({
      where: { id: graph.id },
      select: { createdAt: true },
    }),
    prisma.journeyRevision.findUniqueOrThrow({
      where: {
        journeyId_revision: { journeyId: graph.id, revision: graph.revision },
      },
      select: { createdAt: true },
    }),
  ])
  const projected = projectRecording(graph, {
    createdAt: journey.createdAt.toISOString(),
    updatedAt: revision.createdAt.toISOString(),
  })
  const [owner, revisions, assets] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: graph.ownerId },
      select: { id: true, name: true, image: true },
    }),
    prisma.journeyRevision.findMany({
      where: { journeyId: graph.id },
      select: {
        revision: true,
        actorUser: { select: { id: true, name: true, image: true } },
      },
    }),
    prisma.asset.findMany({
      where: { id: { in: graph.eventAssetLinks.map((link) => link.assetId) } },
      include: { owner: { select: { id: true, name: true, image: true } } },
    }),
  ])
  const source = (user: typeof owner) => ({
    userId: user.id,
    name: user.name,
    image: user.image,
  })
  const manager = isAdmin(context) || context.userId === graph.ownerId
  const byAsset = new Map(assets.map((asset) => [asset.id, asset]))
  projected.role = manager ? "OWNER" : "MEMBER"
  for (const event of projected.events) {
    const canonical = graph.events.find(
      (candidate) => candidate.id === event.id
    )!
    event.source = source(
      revisions.find(
        (record) => record.revision === canonical.introducedRevision
      )?.actorUser ?? owner
    )
    event.canEdit = manager || event.source.userId === context.userId
    const attachments = graph.eventAssetLinks.filter(
      (link) => !link.retiredRevision && link.eventId === event.id
    )
    event.canRemove =
      event.canEdit &&
      (manager ||
        attachments.every(
          (link) => byAsset.get(link.assetId)?.ownerId === context.userId
        ))
    for (const photo of event.photos) {
      const asset = byAsset.get(photo.assetId)!
      photo.source = source(asset.owner)
      photo.canEdit = manager || asset.ownerId === context.userId
    }
    event.receipts = attachments
      .filter((link) => link.role === "RECEIPT" && link.receipt)
      .map((link) => {
        const asset = byAsset.get(link.assetId)!
        return {
          id: link.id,
          assetId: link.assetId,
          url: `/api/assets/${encodeURIComponent(link.assetId)}/file`,
          ...link.receipt!,
          source: source(asset.owner),
          canEdit: manager || asset.ownerId === context.userId,
        }
      })
  }
  return projected
}

function receipt(
  revision: TargetJourneyRevision,
  context: AuthContext,
  request: unknown
) {
  const patch = revision.patch as Array<{ request?: unknown; eventId?: string }>
  if (
    revision.actor.kind !== "USER" ||
    revision.actor.userId !== context.userId ||
    JSON.stringify(patch[0]?.request) !== JSON.stringify(request)
  ) {
    throw new JourneyIdempotencyConflictError()
  }
  return patch[0]?.eventId
}

async function replay(
  context: AuthContext,
  journeyId: string,
  key: string,
  request: unknown
): Promise<RecordingMutationResult | null> {
  const previous = await getJourneyRevisionByIdempotencyKey(
    context,
    journeyId,
    key
  )
  if (!previous) return null
  const eventId = receipt(previous, context, request)
  return {
    journey: await document(context, previous.snapshot),
    ...(eventId ? { eventId } : {}),
    replayed: true,
  }
}

async function listRecordingDocuments(context: AuthContext) {
  const journeys = await prisma.journey.findMany({
    where: {
      ...journeyReadScope(context),
      deletedAt: null,
      visibility: "PRIVATE",
      events: { every: { type: "RECORD" } },
    },
    include: journeyInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  })
  return Promise.all(
    journeys.map(async (journey) =>
      document(context, mapJourneyToGraph(journey))
    )
  )
}

export async function listRecordingJourneys(context: AuthContext) {
  return (await listRecordingDocuments(context)).map(summarizeRecording)
}

// 地点相册投影当前用户可读的旅程；聚合不改变原事件或照片来源。
export async function getRecordingAtlas(context: AuthContext) {
  const documents = await listRecordingDocuments(context)
  return {
    journeys: documents.map(summarizeRecording),
    photos: documents.flatMap((journey) =>
      journey.events.flatMap((event) =>
        event.photos.map((photo) => ({
          ...photo,
          location: photo.location ?? event.location,
          journeyId: journey.id,
          journeyTitle: journey.title,
          eventId: event.id,
          eventTitle: event.title || event.location?.name || "一段经历",
        }))
      )
    ),
  }
}

export async function getRecordingJourney(context: AuthContext, id: string) {
  const graph = await getJourney(context, id)
  if (!graph) throw new RecordingNotFoundError()
  recordingChain(graph)
  return document(context, graph)
}

export async function createRecordingJourney(
  context: AuthContext,
  input: unknown
): Promise<RecordingMutationResult> {
  const parsed = recordingJourneyCreateSchema.parse(input)
  const request = {
    idempotencyKey: parsed.idempotencyKey,
    title: parsed.title ?? "新的旅程",
    description: parsed.description ?? "",
  }
  const id = recordingId(context.userId, request.idempotencyKey, "journey")
  const previous = await replay(context, id, request.idempotencyKey, request)
  if (previous) return previous
  const graph: TargetJourneyGraphSnapshot = {
    id,
    ownerId: context.userId,
    revision: 1,
    title: request.title,
    description: request.description,
    status: "DRAFT",
    visibility: "PRIVATE",
    events: [],
    links: [],
    replacements: [],
    branchSelections: [],
    transitPlanningRuns: [],
    eventAssetLinks: [],
    observations: [],
    eventSourceLinks: [],
  }
  try {
    const created = await createJourney(context, {
      graph,
      operation: "recording.create",
      idempotencyKey: request.idempotencyKey,
      patch: [{ request }],
      inversePatch: [],
    })
    return { journey: await document(context, created), replayed: false }
  } catch (error) {
    if (
      error instanceof JourneyRevisionConflictError ||
      error instanceof JourneyIdempotencyConflictError
    ) {
      const raced = await replay(context, id, request.idempotencyKey, request)
      if (raced) return raced
    }
    throw error
  }
}

export async function mutateRecordingJourney(
  context: AuthContext,
  id: string,
  input: unknown
): Promise<RecordingMutationResult> {
  const request = recordingMutationSchema.parse(input)
  const previous = await replay(context, id, request.idempotencyKey, request)
  if (previous) return previous
  const current = await getJourney(context, id)
  if (!current) throw new RecordingNotFoundError()
  recordingChain(current)
  if (current.revision !== request.expectedRevision)
    throw new JourneyRevisionConflictError()
  await assertRecordingCommandAccess(prisma, context, current, request.command)
  const next = structuredClone(current)
  next.revision += 1
  const now = new Date(
    Math.max(
      Date.now(),
      ...current.events.map((event) => Date.parse(event.updatedAt) + 1)
    )
  ).toISOString()
  const eventId =
    reduceRecordingCore(next, request.command, request.idempotencyKey, now) ??
    (await reduceRecordingPhotos(
      context,
      next,
      request.command,
      request.idempotencyKey,
      now
    ))
  await reduceRecordingReceipts(
    context,
    next,
    request.command,
    request.idempotencyKey,
    now,
    eventId
  )
  try {
    const saved = await commitRecordingJourneyGraph(
      context,
      id,
      {
        graph: next,
        operation: `recording.${request.command.name}`,
        idempotencyKey: request.idempotencyKey,
        patch: [{ request, ...(eventId ? { eventId } : {}) }],
        inversePatch: [],
      },
      current.revision,
      request.command
    )
    if (!saved) throw new RecordingNotFoundError()
    return {
      journey: await document(context, saved),
      ...(eventId ? { eventId } : {}),
      replayed: false,
    }
  } catch (error) {
    // The persistence layer also arbitrates simultaneous retries. Compare the
    // original request before replaying; never reapply it at a newer revision.
    if (
      error instanceof JourneyRevisionConflictError ||
      error instanceof JourneyIdempotencyConflictError
    ) {
      const raced = await replay(context, id, request.idempotencyKey, request)
      if (raced) return raced
    }
    throw error
  }
}
