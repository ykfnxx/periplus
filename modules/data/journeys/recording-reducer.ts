import { routeMatchesCurrent } from "@/lib/journeys/planning"
import { createHash } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { isAdmin, type AuthContext } from "@/modules/auth/server/context"
import {
  type JourneySnapshot,
  type JourneyCommand,
  type JourneyEvent,
  type Contributor,
  type EventInput,
  MAX_PHOTO_CAPTION_LENGTH,
  eventTransitSchema,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import { JourneyInputError } from "./journey-repository"
export function recordingId(journeyId: string, key: string, label: string) {
  return `event-${createHash("sha256").update(`${journeyId}:${key}:${label}`).digest("hex").slice(0, 32)}`
}
export function requireJourneyEvent(journey: JourneySnapshot, id: string) {
  const event = journey.events.find((event) => event.id === id)
  if (!event) throw new JourneyInputError("Event not found")
  return event
}
export function blankEvent(
  id: string,
  source: Contributor,
  now: string
): JourneyEvent {
  return {
    id,
    title: "",
    body: "",
    category: null,
    date: null,
    time: null,
    timeZone: null,
    location: null,
    source,
    canEdit: true,
    canRemove: true,
    photos: [],
    receipts: [],
    createdAt: now,
    updatedAt: now,
  }
}
export function applyEventPatch(event: JourneyEvent, patch: EventInput) {
  const previousLocation = JSON.stringify(event.location)
  const category =
    patch.category === undefined ? event.category : patch.category
  for (const [field, value] of Object.entries(patch)) {
    if (field === "planning" && value !== null) {
      event.planning = { ...event.planning, ...patch.planning }
      continue
    }
    if (field === "hotel" && value !== null) {
      if (!event.hotel || category !== "STAY")
        throw new JourneyInputError(
          "Choose a verified hotel before editing its details"
        )
      if (patch.hotel?.checkInNote === null) delete event.hotel.checkInNote
      else
        event.hotel = { ...event.hotel, ...patch.hotel } as NonNullable<
          JourneyEvent["hotel"]
        >
      continue
    }
    if (field === "transit" && value !== null) {
      if (category !== "TRANSIT")
        throw new JourneyInputError("Transit details require a transit event")
      event.transit = eventTransitSchema.parse({
        routeState: "EMPTY",
        ...event.transit,
        ...patch.transit,
      })
      continue
    }
    if (
      value === null &&
      ["planning", "hotel", "transit", "cuisine", "bookingReference"].includes(
        field
      )
    )
      delete (event as unknown as Record<string, unknown>)[field]
    else (event as unknown as Record<string, unknown>)[field] = value
  }
  if (JSON.stringify(event.location) !== previousLocation) {
    if (event.planning)
      for (const field of [
        "placeId",
        "provider",
        "providerPlaceId",
        "coverImageUrl",
      ] as const)
        delete event.planning[field]
    delete event.hotel
  }
  if (event.category !== "STAY") delete event.hotel
  if (event.category !== "TRANSIT") delete event.transit
}
function invalidateChangedRoutes(journey: JourneySnapshot) {
  for (const [index, event] of journey.events.entries()) {
    if (!event.transit?.route) continue
    if (
      journey.events[index - 1]?.id !== event.transit.fromEventId ||
      journey.events[index + 1]?.id !== event.transit.toEventId ||
      !routeMatchesCurrent(event, journey.events)
    ) {
      event.transit.routeState = "ROUTE_STALE"
      delete event.transit.route
    }
  }
}
export async function reduceJourneyCommand(
  context: AuthContext,
  journey: JourneySnapshot,
  command: JourneyCommand,
  key: string,
  now: string,
  tx: Prisma.TransactionClient = prisma
) {
  const before = structuredClone(journey)
  let eventId: string | undefined
  const sourceUser = await tx.user.findUniqueOrThrow({
    where: { id: context.userId },
    select: { id: true, name: true, image: true },
  })
  const source = {
    userId: sourceUser.id,
    name: sourceUser.name,
    image: sourceUser.image,
  }
  const image = async (assetId: string, existingEventId?: string) => {
    const asset = await tx.asset.findUnique({
      where: { id: assetId },
      include: { owner: { select: { id: true, name: true, image: true } } },
    })
    const shared = before.events.some((event) =>
      [...event.photos, ...event.receipts].some(
        (item) => item.assetId === assetId
      )
    )
    if (
      !asset ||
      asset.deletedAt ||
      asset.kind !== "IMAGE" ||
      !(
        asset.ownerId === context.userId ||
        before.events
          .find((event) => event.id === existingEventId)
          ?.photos.some((photo) => photo.assetId === assetId) ||
        ((journey.ownerId === context.userId || isAdmin(context)) && shared)
      )
    )
      throw new JourneyInputError("Image is not available to this Journey")
    return {
      assetId,
      url: `/api/assets/${encodeURIComponent(assetId)}/file`,
      source: {
        userId: asset.owner.id,
        name: asset.owner.name,
        image: asset.owner.image,
      },
      canEdit: true,
    }
  }
  const insert = (event: JourneyEvent, afterId: string | null) => {
    const at =
      afterId === null
        ? -1
        : journey.events.findIndex((item) => item.id === afterId)
    if (afterId !== null && at < 0)
      throw new JourneyInputError("Event insertion anchor not found")
    journey.events.splice(at + 1, 0, event)
  }
  switch (command.name) {
    case "journey.update":
      Object.assign(journey, command.patch)
      break
    case "event.add": {
      const event = blankEvent(
        recordingId(journey.id, key, "event"),
        source,
        now
      )
      applyEventPatch(event, command.content)
      insert(event, command.afterEventId)
      eventId = event.id
      if (command.receipt) {
        const { assetId, ...fields } = command.receipt
        event.receipts.push({
          ...fields,
          ...(await image(assetId)),
          id: recordingId(journey.id, key, `receipt:${assetId}`),
        })
      }
      break
    }
    case "event.update": {
      const event = requireJourneyEvent(journey, command.eventId)
      applyEventPatch(event, command.patch)
      event.updatedAt = now
      eventId = event.id
      break
    }
    case "event.move": {
      if (command.eventId === command.afterEventId)
        throw new JourneyInputError("An event cannot follow itself")
      const event = requireJourneyEvent(journey, command.eventId)
      journey.events = journey.events.filter((item) => item.id !== event.id)
      insert(event, command.afterEventId)
      eventId = event.id
      break
    }
    case "event.remove":
      requireJourneyEvent(journey, command.eventId)
      journey.events = journey.events.filter(
        (item) => item.id !== command.eventId
      )
      eventId = command.eventId
      break
    case "photos.set": {
      const event = requireJourneyEvent(journey, command.eventId)
      if (
        new Set(command.photos.map((item) => item.assetId)).size !==
        command.photos.length
      )
        throw new JourneyInputError("A photo can appear only once in an event")
      if (
        command.coverAssetId !== null &&
        !command.photos.some((item) => item.assetId === command.coverAssetId)
      )
        throw new JourneyInputError("Cover must belong to this event")
      const photos = []
      for (const photo of command.photos) {
        const previous = event.photos.find(
          (item) => item.assetId === photo.assetId
        )
        if (
          photo.caption !== previous?.caption &&
          photo.caption.length > MAX_PHOTO_CAPTION_LENGTH
        )
          throw new JourneyInputError(
            "Photo descriptions allow at most 100 characters"
          )
        photos.push({
          ...(await image(photo.assetId, event.id)),
          caption: photo.caption,
          location: previous?.location ?? null,
          isCover: command.coverAssetId === photo.assetId,
        })
      }
      event.photos = photos
      event.updatedAt = now
      eventId = event.id
      break
    }
    case "photo.update": {
      const event = requireJourneyEvent(journey, command.eventId)
      const photo = event.photos.find(
        (item) => item.assetId === command.assetId
      )
      if (!photo) throw new JourneyInputError("Photo not found on this event")
      Object.assign(photo, command.patch)
      event.updatedAt = now
      eventId = event.id
      break
    }
    case "photo.move": {
      if (command.fromEventId === command.toEventId)
        throw new JourneyInputError(
          "Use photos.set to reorder within one event"
        )
      const from = requireJourneyEvent(journey, command.fromEventId),
        to = requireJourneyEvent(journey, command.toEventId)
      const photo = from.photos.find((item) => item.assetId === command.assetId)
      if (
        !photo ||
        to.photos.some((item) => item.assetId === command.assetId) ||
        to.photos.length >= 100
      )
        throw new JourneyInputError("Photo cannot be moved to this event")
      const at =
        command.afterAssetId === null
          ? -1
          : to.photos.findIndex((item) => item.assetId === command.afterAssetId)
      if (command.afterAssetId !== null && at < 0)
        throw new JourneyInputError("Photo insertion anchor not found")
      from.photos = from.photos.filter((item) => item.assetId !== photo.assetId)
      to.photos.splice(at + 1, 0, { ...photo, isCover: false })
      from.updatedAt = to.updatedAt = now
      eventId = to.id
      break
    }
    case "receipt.add": {
      const event = requireJourneyEvent(journey, command.eventId)
      if (
        event.receipts.length >= 20 ||
        event.receipts.some((item) => item.assetId === command.receipt.assetId)
      )
        throw new JourneyInputError("Receipt cannot be attached to this event")
      const { assetId, ...fields } = command.receipt
      event.receipts.push({
        ...fields,
        ...(await image(assetId)),
        id: recordingId(journey.id, key, `receipt:${assetId}`),
      })
      event.updatedAt = now
      eventId = event.id
      break
    }
    case "receipt.update":
    case "receipt.remove": {
      const event = requireJourneyEvent(journey, command.eventId)
      const receipt = event.receipts.find(
        (item) => item.id === command.receiptId
      )
      if (!receipt)
        throw new JourneyInputError("Receipt not found on this event")
      if (command.name === "receipt.update")
        Object.assign(receipt, command.fields)
      else
        event.receipts = event.receipts.filter(
          (item) => item.id !== command.receiptId
        )
      event.updatedAt = now
      eventId = event.id
      break
    }
  }
  journey.updatedAt = now
  invalidateChangedRoutes(journey)
  return eventId
}
