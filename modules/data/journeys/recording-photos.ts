import {
  MAX_RECORDING_PHOTO_CAPTION_LENGTH,
  type RecordingCommand,
  type RecordingLocation,
  type TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import { JourneyInputError } from "./journey-repository"
import { recordingId, requireRecordingEvent } from "./recording-reducer"

type PhotoSelection = {
  assetId: string
  caption: string
  location: RecordingLocation | null
}

function selectedPhotos(graph: TargetJourneyGraphSnapshot, eventId: string) {
  return graph.eventAssetLinks
    .filter((link) => !link.retiredRevision && link.eventId === eventId)
    .sort((left, right) => left.rank - right.rank)
}

function selection(
  links: TargetJourneyGraphSnapshot["eventAssetLinks"]
): PhotoSelection[] {
  return links.map((link) => ({
    assetId: link.assetId,
    caption: link.caption ?? "",
    location: link.location ?? null,
  }))
}

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
  // the new caption/location/order; Asset and event identities stay put.
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
      ...(photo.location ? { location: photo.location } : {}),
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
    const existing = new Map(
      selectedPhotos(graph, command.eventId).map((link) => [link.assetId, link])
    )
    // Existing long descriptions may pass through membership/order writes, but
    // newly entered or changed descriptions must satisfy the current limit.
    for (const photo of command.photos) {
      if (
        photo.caption !== (existing.get(photo.assetId)?.caption ?? "") &&
        photo.caption.length > MAX_RECORDING_PHOTO_CAPTION_LENGTH
      )
        throw new JourneyInputError(
          "Photo descriptions allow at most 100 characters"
        )
    }
    await setPhotos(
      graph,
      command.eventId,
      command.photos.map((photo) => ({
        ...photo,
        location: existing.get(photo.assetId)?.location ?? null,
      })),
      command.coverAssetId,
      key,
      now
    )
    return command.eventId
  }
  if (command.name === "photo.update") {
    requireRecordingEvent(graph, command.eventId)
    const links = selectedPhotos(graph, command.eventId)
    if (!links.some((link) => link.assetId === command.assetId))
      throw new JourneyInputError("Photo is not attached to this event")
    await setPhotos(
      graph,
      command.eventId,
      selection(links).map((photo) =>
        photo.assetId === command.assetId
          ? { ...photo, ...command.patch }
          : photo
      ),
      links.find((link) => link.role === "COVER")?.assetId ?? null,
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
  const source = selectedPhotos(graph, command.fromEventId)
  const destination = selectedPhotos(graph, command.toEventId)
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
