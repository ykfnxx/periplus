import type { AuthContext } from "@/modules/auth/server/context"
import {
  journeyCreateSchema,
  journeyMutationSchema,
  type JourneyMutationResult,
  type JourneySnapshot,
} from "@/modules/data-model/contracts"
import {
  createJourney,
  commitJourney,
  getJourney,
  listJourneys,
  presentJourney,
  getJourneyRevisionByIdempotencyKey,
  JourneyIdempotencyConflictError,
  JourneyRevisionConflictError,
} from "./journey-repository"
import { recordingId, reduceJourneyCommand } from "./recording-reducer"
import { summarizeJourney } from "./journey-summary"
export class RecordingNotFoundError extends Error {
  constructor() {
    super("Journey not found")
    this.name = "RecordingNotFoundError"
  }
}
async function replay(
  context: AuthContext,
  id: string,
  key: string,
  request: unknown
): Promise<JourneyMutationResult | null> {
  const revision = await getJourneyRevisionByIdempotencyKey(context, id, key)
  if (!revision) return null
  const patch = revision.patch as { request: unknown; eventId?: string }[]
  if (JSON.stringify(patch[0]?.request) !== JSON.stringify(request))
    throw new JourneyIdempotencyConflictError()
  return {
    journey: await presentJourney(context, revision.snapshot),
    ...(patch[0]?.eventId ? { eventId: patch[0].eventId } : {}),
    replayed: true,
  }
}
export async function listRecordingJourneys(context: AuthContext) {
  return (await listJourneys(context)).map(summarizeJourney)
}
export async function getRecordingAtlas(context: AuthContext) {
  const journeys = await listJourneys(context)
  return {
    journeys: journeys.map(summarizeJourney),
    photos: journeys.flatMap((journey) =>
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
  const journey = await getJourney(context, id)
  if (!journey) throw new RecordingNotFoundError()
  return journey
}
export async function createRecordingJourney(
  context: AuthContext,
  input: unknown
): Promise<JourneyMutationResult> {
  const parsed = journeyCreateSchema.parse(input)
  const request = {
    idempotencyKey: parsed.idempotencyKey,
    title: parsed.title ?? "新的旅程",
    description: parsed.description ?? "",
  }
  const id = recordingId(context.userId, request.idempotencyKey, "journey")
  const previous = await replay(context, id, request.idempotencyKey, request)
  if (previous) return previous
  const now = new Date().toISOString()
  const journey: JourneySnapshot = {
    id,
    ownerId: context.userId,
    role: "OWNER",
    revision: 1,
    title: request.title,
    description: request.description,
    status: "DRAFT",
    visibility: "PRIVATE",
    events: [],
    createdAt: now,
    updatedAt: now,
  }
  try {
    return {
      journey: await presentJourney(
        context,
        await createJourney(context, {
          journey,
          operation: "journey.create",
          idempotencyKey: request.idempotencyKey,
          patch: [{ request }],
          inversePatch: [],
        })
      ),
      replayed: false,
    }
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
): Promise<JourneyMutationResult> {
  const request = journeyMutationSchema.parse(input)
  const previous = await replay(context, id, request.idempotencyKey, request)
  if (previous) return previous
  const before = await getRecordingJourney(context, id)
  if (before.revision !== request.expectedRevision)
    throw new JourneyRevisionConflictError()
  const next = structuredClone(before)
  next.revision++
  const now = new Date(
    Math.max(Date.now(), Date.parse(before.updatedAt) + 1)
  ).toISOString()
  const eventId = await reduceJourneyCommand(
    context,
    next,
    request.command,
    request.idempotencyKey,
    now
  )
  try {
    const saved = await commitJourney(
      context,
      id,
      {
        journey: next,
        operation: request.command.name,
        idempotencyKey: request.idempotencyKey,
        patch: [{ request, ...(eventId ? { eventId } : {}) }],
        inversePatch: [{ journey: before }],
      },
      request.expectedRevision,
      request.command
    )
    if (!saved) throw new RecordingNotFoundError()
    return {
      journey: await presentJourney(context, saved),
      ...(eventId ? { eventId } : {}),
      replayed: false,
    }
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
