import {
  recordingJourneySchema,
  recordingJourneySummarySchema,
  type RecordingJourney,
  type TargetJourneyEvent,
  type TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import { JourneyInputError } from "./journey-repository"

export type RecordingChainEvent = Extract<
  TargetJourneyEvent,
  { type: "RECORD" }
>

export function recordingChain(
  graph: TargetJourneyGraphSnapshot
): RecordingChainEvent[] {
  const events = graph.events.filter((event) => !event.retiredRevision)
  if (
    events.some(
      (event) =>
        event.type !== "RECORD" ||
        event.parentSectionEventId !== null ||
        event.placementStatus !== "SCHEDULED"
    )
  ) {
    throw new JourneyInputError(
      "This Journey does not contain a recording chain"
    )
  }
  const links = graph.links.filter((link) => !link.retiredRevision)
  if (links.some((link) => link.kind !== "MAIN")) {
    throw new JourneyInputError(
      "Recording order must be one explicit linear chain"
    )
  }
  if (!events.length) return []
  const byId = new Map(
    events.map((event) => [event.id, event as RecordingChainEvent])
  )
  const incoming = new Set(links.map((link) => link.toEventId))
  const starts = events.filter((event) => !incoming.has(event.id))
  if (starts.length !== 1)
    throw new JourneyInputError("Recording chain has no unique first event")
  const outgoing = new Map(
    links.map((link) => [link.fromEventId, link.toEventId])
  )
  const ordered: RecordingChainEvent[] = []
  const seen = new Set<string>()
  let cursor: string | undefined = starts[0]!.id
  while (cursor) {
    const event = byId.get(cursor)
    if (!event || seen.has(cursor))
      throw new JourneyInputError("Invalid recording chain")
    seen.add(cursor)
    ordered.push(event)
    cursor = outgoing.get(cursor)
  }
  if (ordered.length !== events.length)
    throw new JourneyInputError("Recording chain is disconnected")
  return ordered
}

export function projectRecording(
  graph: TargetJourneyGraphSnapshot,
  timestamps: { createdAt: string; updatedAt: string }
): RecordingJourney {
  return recordingJourneySchema.parse({
    id: graph.id,
    revision: graph.revision,
    title: graph.title,
    description: graph.description ?? "",
    status: graph.status,
    visibility: graph.visibility,
    events: recordingChain(graph).map((event) => ({
      ...event.detail,
      id: event.id,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
      photos: graph.eventAssetLinks
        .filter((link) => !link.retiredRevision && link.eventId === event.id)
        .sort(
          (left, right) =>
            left.rank - right.rank || left.assetId.localeCompare(right.assetId)
        )
        .map((link) => ({
          assetId: link.assetId,
          url: `/api/photos/${encodeURIComponent(link.assetId)}/file`,
          caption: link.caption ?? "",
          isCover: link.role === "COVER",
        })),
    })),
    ...timestamps,
  })
}

export function summarizeRecording(journey: RecordingJourney) {
  const dates = journey.events
    .flatMap((event) => (event.date ? [event.date] : []))
    .sort()
  const photos = journey.events.flatMap((event) => event.photos)
  const { events: _events, ...metadata } = journey
  return recordingJourneySummarySchema.parse({
    ...metadata,
    coverUrl: (photos.find((photo) => photo.isCover) ?? photos[0])?.url ?? null,
    eventCount: journey.events.length,
    photoCount: photos.length,
    startDate: dates[0] ?? null,
    endDate: dates.at(-1) ?? null,
  })
}
