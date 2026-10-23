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
  commitJourneyRevisionChain,
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

export class RecordingNotFoundError extends Error {
  constructor() {
    super("Journey not found")
    this.name = "RecordingNotFoundError"
  }
}

async function document(graph: TargetJourneyGraphSnapshot) {
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
  return projectRecording(graph, {
    createdAt: journey.createdAt.toISOString(),
    updatedAt: revision.createdAt.toISOString(),
  })
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
    journey: await document(previous.snapshot),
    ...(eventId ? { eventId } : {}),
    replayed: true,
  }
}

async function listRecordingDocuments(context: AuthContext) {
  const journeys = await prisma.journey.findMany({
    where: {
      ownerId: context.userId,
      deletedAt: null,
      visibility: "PRIVATE",
      events: { every: { type: "RECORD" } },
    },
    include: journeyInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  })
  return Promise.all(
    journeys.map(async (journey) => document(mapJourneyToGraph(journey)))
  )
}

export async function listRecordingJourneys(context: AuthContext) {
  return (await listRecordingDocuments(context)).map(summarizeRecording)
}

// 地点相册是当前作者照片的只读投影，聚合不会改变原事件或游记归属。
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
  return document(graph)
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
    return { journey: await document(created), replayed: false }
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
      next,
      request.command,
      request.idempotencyKey,
      now
    ))
  try {
    const saved = await commitJourneyRevisionChain(
      context,
      id,
      [
        {
          graph: next,
          operation: `recording.${request.command.name}`,
          idempotencyKey: request.idempotencyKey,
          patch: [{ request, ...(eventId ? { eventId } : {}) }],
          inversePatch: [],
        },
      ],
      current.revision
    )
    if (!saved) throw new RecordingNotFoundError()
    return {
      journey: await document(saved),
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
