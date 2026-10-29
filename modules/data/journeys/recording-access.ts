import type { Prisma } from "@prisma/client"
import {
  isAdmin,
  PermissionDeniedError,
  type AuthContext,
} from "@/modules/auth/server/context"
import type {
  JourneyCommand,
  JourneySnapshot,
} from "@/modules/data-model/contracts"
export function journeyReadScope(
  context: AuthContext
): Prisma.JourneyWhereInput {
  return isAdmin(context)
    ? {}
    : {
        OR: [
          { ownerId: context.userId },
          { members: { some: { userId: context.userId } } },
        ],
      }
}
export async function assertJourneyCommandAccess(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  journey: JourneySnapshot,
  command: JourneyCommand
) {
  if (isAdmin(context) || journey.ownerId === context.userId) return
  if (
    !(await tx.journeyMember.findUnique({
      where: {
        journeyId_userId: { journeyId: journey.id, userId: context.userId },
      },
    }))
  )
    throw new PermissionDeniedError("You are not a member of this Journey")
  const deny = () => {
    throw new PermissionDeniedError("Members may change only their own content")
  }
  if (command.name === "journey.update") deny()
  const event =
    "eventId" in command
      ? journey.events.find((event) => event.id === command.eventId)
      : undefined
  if (
    ["event.update", "event.move", "event.remove"].includes(command.name) &&
    event?.source.userId !== context.userId
  )
    deny()
  if (
    command.name === "event.remove" &&
    event &&
    [...event.photos, ...event.receipts].some(
      (item) => item.source.userId !== context.userId
    )
  )
    deny()
  const ownPhoto = (assetId: string) =>
    journey.events.some((event) =>
      event.photos.some(
        (photo) =>
          photo.assetId === assetId && photo.source.userId === context.userId
      )
    )
  if (
    (command.name === "photo.update" || command.name === "photo.move") &&
    !ownPhoto(command.assetId)
  )
    deny()
  if (
    (command.name === "receipt.update" || command.name === "receipt.remove") &&
    !event?.receipts.some(
      (receipt) =>
        receipt.id === command.receiptId &&
        receipt.source.userId === context.userId
    )
  )
    deny()
  if (command.name === "photos.set") {
    const protectedPhotos =
      event?.photos.filter((photo) => photo.source.userId !== context.userId) ??
      []
    for (const photo of protectedPhotos) {
      const submitted = command.photos.find(
        (item) => item.assetId === photo.assetId
      )
      if (
        !submitted ||
        submitted.caption !== photo.caption ||
        photo.isCover !== (photo.assetId === command.coverAssetId)
      )
        deny()
    }
    const ids = new Set(protectedPhotos.map((photo) => photo.assetId))
    if (
      JSON.stringify(
        command.photos
          .filter((photo) => ids.has(photo.assetId))
          .map((photo) => photo.assetId)
      ) !== JSON.stringify(protectedPhotos.map((photo) => photo.assetId))
    )
      deny()
  }
}
