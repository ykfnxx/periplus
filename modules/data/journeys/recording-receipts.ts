import type { AuthContext } from "@/modules/auth/server/context"
import { isAdmin } from "@/modules/auth/server/context"
import {
  type RecordingCommand,
  type ReceiptFields,
  type ReceiptInput,
  type TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import { JourneyInputError } from "./journey-repository"
import { recordingId, requireRecordingEvent } from "./recording-reducer"

export async function reduceRecordingReceipts(
  context: AuthContext,
  graph: TargetJourneyGraphSnapshot,
  command: RecordingCommand,
  key: string,
  now: string,
  addedEventId?: string
) {
  const input =
    command.name === "event.add"
      ? command.receipt
      : command.name === "receipt.add"
        ? command.receipt
        : undefined
  if (
    !input &&
    command.name !== "receipt.update" &&
    command.name !== "receipt.remove"
  )
    return
  const eventId =
    command.name === "event.add"
      ? addedEventId!
      : "eventId" in command
        ? command.eventId
        : ""
  const event = requireRecordingEvent(graph, eventId)
  const links = graph.eventAssetLinks.filter(
    (link) =>
      !link.retiredRevision &&
      link.eventId === eventId &&
      link.role === "RECEIPT"
  )
  let receipt: ReceiptInput
  let rank: number
  if (input) {
    if (links.length >= 20)
      throw new JourneyInputError("An event may contain at most 20 receipts")
    if (links.some((link) => link.assetId === input.assetId))
      throw new JourneyInputError("This receipt is already attached")
    receipt = input
    rank = Math.max(-1, ...links.map((link) => link.rank)) + 1
  } else if (
    command.name === "receipt.update" ||
    command.name === "receipt.remove"
  ) {
    const existing = links.find((link) => link.id === command.receiptId)
    if (!existing)
      throw new JourneyInputError("Receipt not found on this event")
    existing.retiredRevision = graph.revision
    event.updatedAt = now
    if (command.name === "receipt.remove") return
    receipt = { assetId: existing.assetId, ...command.fields }
    rank = existing.rank
  } else return
  const asset = await prisma.asset.findUnique({
    where: { id: receipt.assetId },
  })
  const shared = graph.eventAssetLinks.some(
    (link) => link.assetId === receipt.assetId
  )
  if (
    !asset ||
    asset.deletedAt ||
    asset.kind !== "IMAGE" ||
    !(
      asset.ownerId === context.userId ||
      ((graph.ownerId === context.userId || isAdmin(context)) && shared)
    )
  ) {
    throw new JourneyInputError(
      "Receipt image is not available to this journey"
    )
  }
  const { assetId, ...fields } = receipt
  graph.eventAssetLinks.push({
    id: recordingId(graph.id, key, `receipt:${eventId}:${assetId}`),
    journeyId: graph.id,
    eventId,
    assetId,
    assetChecksum: asset.checksum,
    role: "RECEIPT",
    rank,
    visibility: "PRIVATE",
    receipt: fields as ReceiptFields,
    introducedRevision: graph.revision,
    createdAt: now,
  })
  event.updatedAt = now
}
