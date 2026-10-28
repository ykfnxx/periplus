import type { Prisma } from "@prisma/client"
import {
  isAdmin,
  PermissionDeniedError,
  type AuthContext,
} from "@/modules/auth/server/context"
import type {
  RecordingCommand,
  TargetJourneyGraphSnapshot,
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

export async function assertRecordingCommandAccess(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  graph: TargetJourneyGraphSnapshot,
  command: RecordingCommand
) {
  if (isAdmin(context) || graph.ownerId === context.userId) return
  const member = await tx.journeyMember.findUnique({
    where: {
      journeyId_userId: { journeyId: graph.id, userId: context.userId },
    },
  })
  if (!member)
    throw new PermissionDeniedError("You are not a member of this journey")
  const deny = () => {
    throw new PermissionDeniedError("Members may change only their own content")
  }
  const eventId = "eventId" in command ? command.eventId : undefined
  if (command.name === "journey.update") deny()
  if (
    ["event.update", "event.move", "event.remove"].includes(command.name) &&
    eventId
  ) {
    const event = await tx.journeyEvent.findUnique({
      where: { id: eventId },
      include: { introducedBy: true },
    })
    if (
      !event ||
      event.journeyId !== graph.id ||
      event.introducedBy.actorUserId !== context.userId
    )
      deny()
  }
  const links = graph.eventAssetLinks.filter((link) => !link.retiredRevision)
  const assets = await tx.asset.findMany({
    where: { id: { in: links.map((link) => link.assetId) } },
    select: { id: true, ownerId: true },
  })
  const own = (assetId: string) =>
    assets.find((asset) => asset.id === assetId)?.ownerId === context.userId
  if (
    command.name === "event.remove" &&
    links.some((link) => link.eventId === command.eventId && !own(link.assetId))
  )
    deny()
  if (
    (command.name === "photo.update" || command.name === "photo.move") &&
    !own(command.assetId)
  )
    deny()
  if (command.name === "receipt.update" || command.name === "receipt.remove") {
    const link = links.find(
      (link) =>
        link.id === command.receiptId &&
        link.eventId === command.eventId &&
        link.role === "RECEIPT"
    )
    if (!link || !own(link.assetId)) deny()
  }
  if (command.name === "photos.set") {
    const protectedPhotos = links
      .filter(
        (link) =>
          link.eventId === command.eventId &&
          ["COVER", "GALLERY"].includes(link.role) &&
          !own(link.assetId)
      )
      .sort((a, b) => a.rank - b.rank)
    for (const link of protectedPhotos) {
      const photo = command.photos.find(
        (photo) => photo.assetId === link.assetId
      )
      if (
        !photo ||
        photo.caption !== (link.caption ?? "") ||
        (link.role === "COVER") !== (command.coverAssetId === link.assetId)
      )
        deny()
    }
    const protectedIds = new Set(protectedPhotos.map((link) => link.assetId))
    if (
      JSON.stringify(
        command.photos
          .filter((photo) => protectedIds.has(photo.assetId))
          .map((photo) => photo.assetId)
      ) !== JSON.stringify(protectedPhotos.map((link) => link.assetId))
    )
      deny()
  }
}
