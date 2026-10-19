import {
  type RecordingCommand,
  type TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import { JourneyInputError } from "./journey-repository"
import { recordingId, requireRecordingEvent } from "./recording-reducer"

type PhotoSelection = { assetId: string; caption: string }

async function setPhotos(
  graph: TargetJourneyGraphSnapshot,
  eventId: string,
  photos: PhotoSelection[],
  coverAssetId: string | null,
  key: string,
  now: string
) {
  const event = requireRecordingEvent(graph, eventId)
  const ids = photos.map((photo) => photo.assetId)
  if (new Set(ids).size !== ids.length)
    throw new JourneyInputError("A photo can appear only once in an event")
  if (coverAssetId !== null && !ids.includes(coverAssetId))
    throw new JourneyInputError("The cover must be attached to this event")
  const assets = await prisma.asset.findMany({
    where: { id: { in: ids }, deletedAt: null, kind: "IMAGE" },
  })
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  for (const id of ids) {
    const asset = byId.get(id)
    if (!asset || asset.ownerId !== graph.ownerId) {
      throw new JourneyInputError(
        "Photo is missing or is not available to this Journey"
      )
    }
  }
  // Links are revisioned facts. An edit retires its old membership and records
  // the new caption/order; the underlying Asset and event identities stay put.
  for (const link of graph.eventAssetLinks) {
    if (!link.retiredRevision && link.eventId === eventId)
      link.retiredRevision = graph.revision
  }
  for (const [rank, photo] of photos.entries()) {
    graph.eventAssetLinks.push({
      id: recordingId(graph.id, key, `photo:${eventId}:${photo.assetId}`),
      journeyId: graph.id,
      eventId,
      assetId: photo.assetId,
      assetChecksum: byId.get(photo.assetId)!.checksum,
      role: photo.assetId === coverAssetId ? "COVER" : "GALLERY",
      rank,
      caption: photo.caption,
      visibility: "PRIVATE",
      introducedRevision: graph.revision,
      createdAt: now,
    })
  }
  event.updatedAt = now
}

export async function reduceRecordingPhotos(
  graph: TargetJourneyGraphSnapshot,
  command: RecordingCommand,
  key: string,
  now: string
): Promise<string | undefined> {
  if (command.name === "photos.set") {
    await setPhotos(
      graph,
      command.eventId,
      command.photos,
      command.coverAssetId,
      key,
      now
    )
    return command.eventId
  }
  if (command.name !== "photo.move") return
  if (command.fromEventId === command.toEventId) {
    throw new JourneyInputError("Move within an event using photos.set")
  }
  requireRecordingEvent(graph, command.fromEventId)
  requireRecordingEvent(graph, command.toEventId)
  const selected = (eventId: string) =>
    graph.eventAssetLinks
      .filter((link) => !link.retiredRevision && link.eventId === eventId)
      .sort((left, right) => left.rank - right.rank)
  const source = selected(command.fromEventId)
  const destination = selected(command.toEventId)
  const moved = source.find((link) => link.assetId === command.assetId)
  if (!moved)
    throw new JourneyInputError("Photo is not attached to the source event")
  if (destination.some((link) => link.assetId === command.assetId))
    throw new JourneyInputError(
      "Photo is already attached to the destination event"
    )
  if (destination.length >= 100)
    throw new JourneyInputError("An event may contain at most 100 photos")
  const at =
    command.afterAssetId === null
      ? -1
      : destination.findIndex((link) => link.assetId === command.afterAssetId)
  if (command.afterAssetId !== null && at < 0)
    throw new JourneyInputError("Photo insertion anchor not found")
  const sourcePhotos = source.filter((link) => link.assetId !== command.assetId)
  destination.splice(at + 1, 0, moved)
  const selection = (links: typeof source): PhotoSelection[] =>
    links.map((link) => ({
      assetId: link.assetId,
      caption: link.caption ?? "",
    }))
  await setPhotos(
    graph,
    command.fromEventId,
    selection(sourcePhotos),
    sourcePhotos.find((link) => link.role === "COVER")?.assetId ?? null,
    key,
    now
  )
  await setPhotos(
    graph,
    command.toEventId,
    selection(destination),
    destination.find(
      (link) => link.eventId === command.toEventId && link.role === "COVER"
    )?.assetId ?? null,
    key,
    now
  )
  return command.toEventId
}
