import type { Prisma } from "@prisma/client"
import type { AuthContext } from "@/modules/auth/server/context"
import {
  journeySnapshotSchema,
  journeyCommandSchema,
  type JourneySnapshot,
  type JourneyEvent,
} from "@/modules/data-model/contracts"
import {
  recordingId,
  reduceJourneyCommand,
} from "@/modules/data/journeys/recording-reducer"
import { assertJourneyCommandAccess } from "@/modules/data/journeys/recording-access"
import { assertJourneyTransition } from "@/modules/data/journeys/journey-repository"
import type {
  PlanningEdit,
  PlanningReference,
  PlanningDiffEntry,
  PlanningEventSummary,
} from "../contracts"
import { PlanningError } from "./errors"

export function summarizePlanningEvent(
  event: JourneyEvent
): PlanningEventSummary {
  const {
    id,
    title,
    body,
    category,
    date,
    time,
    timeZone,
    startAt,
    endAt,
    location,
    canEdit,
    canRemove,
  } = event
  return {
    id,
    title,
    body,
    category,
    date,
    time,
    timeZone,
    startAt,
    endAt,
    location,
    canEdit,
    canRemove,
    planning: event.planning
      ? { durationMinutes: event.planning.durationMinutes }
      : undefined,
    transit: event.transit
      ? {
          fromName: event.transit.fromName,
          toName: event.transit.toName,
          fromEventId: event.transit.fromEventId,
          toEventId: event.transit.toEventId,
          transportMode: event.transit.transportMode,
          distanceMeters: event.transit.distanceMeters,
          notes: event.transit.notes,
          requestMode: event.transit.requestMode,
          preference: event.transit.preference,
          routeState: event.transit.routeState,
        }
      : undefined,
    photoCount: event.photos.length,
    receiptCount: event.receipts.length,
    hasBooking: Boolean(event.bookingReference),
    protected: ["CONFIRMED", "SKIPPED", "CANCELLED"].includes(
      event.executionStatus ?? ""
    ),
  }
}
function businessEvent(event: JourneyEvent): Record<string, unknown> {
  const facts = (value: object, excluded: string[]) =>
    Object.fromEntries(
      Object.entries(value).filter(([key]) => !excluded.includes(key))
    )
  return {
    ...facts(event, [
      "createdAt",
      "updatedAt",
      "canEdit",
      "canRemove",
      "source",
      "photos",
      "receipts",
    ]),
    sourceUserId: event.source.userId,
    photos: event.photos.map((photo) => ({
      ...facts(photo, ["url", "canEdit", "source"]),
      sourceUserId: photo.source.userId,
    })),
    receipts: event.receipts.map((receipt) => ({
      ...facts(receipt, ["url", "canEdit", "source"]),
      sourceUserId: receipt.source.userId,
    })),
  }
}
export function businessEvents(journey: JourneySnapshot) {
  return journey.events.map(businessEvent)
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export function planningDiff(
  before: JourneySnapshot,
  after: JourneySnapshot
): PlanningDiffEntry[] {
  const result: PlanningDiffEntry[] = []
  for (const id of new Set([
    ...before.events.map((e) => e.id),
    ...after.events.map((e) => e.id),
  ])) {
    const a = before.events.find((e) => e.id === id),
      b = after.events.find((e) => e.id === id)
    const oldFacts = a ? businessEvent(a) : {},
      newFacts = b ? businessEvent(b) : {}
    const changedFields =
      a && b
        ? Object.keys({ ...oldFacts, ...newFacts }).filter(
            (key) => !same(oldFacts[key], newFacts[key])
          )
        : []
    const oldPrev =
      before.events[before.events.findIndex((e) => e.id === id) - 1]?.id ?? null
    const newPrev =
      after.events[after.events.findIndex((e) => e.id === id) - 1]?.id ?? null
    if (a && b && !changedFields.length && oldPrev === newPrev) continue
    result.push({
      eventId: id,
      kind: !a
        ? "added"
        : !b
          ? "removed"
          : changedFields.length
            ? "updated"
            : "moved",
      before: a ? summarizePlanningEvent(a) : null,
      after: b ? summarizePlanningEvent(b) : null,
      changedFields,
      impacts: {
        photos: !b ? a!.photos.length : 0,
        receipts: !b ? a!.receipts.length : 0,
        hotelCleared: Boolean(a?.hotel && !b?.hotel),
        providerBindingCleared: Boolean(
          a?.planning &&
          ["provider", "placeId", "providerPlaceId", "coverImageUrl"].some(
            (key) =>
              a.planning?.[
                key as keyof NonNullable<JourneyEvent["planning"]>
              ] !== undefined &&
              b?.planning?.[
                key as keyof NonNullable<JourneyEvent["planning"]>
              ] === undefined
          )
        ),
        routeInvalidated: Boolean(a?.transit?.route && !b?.transit?.route),
        linkedTransitIds: !b
          ? before.events
              .filter(
                (e) =>
                  e.transit?.fromEventId === id || e.transit?.toEventId === id
              )
              .map((e) => e.id)
          : [],
      },
    })
  }
  return result
}
export async function reducePlanningOperations(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  proposalId: string,
  base: JourneySnapshot,
  operations: PlanningEdit[],
  now: string
) {
  const next = structuredClone(base)
  const refs = new Map<string, string>()
  const resolve = (ref: PlanningReference | null): string | null => {
    if (ref === null) return null
    const id = typeof ref === "string" ? ref : refs.get(ref.draftRef)
    if (!id || !next.events.some((e) => e.id === id))
      throw new PlanningError(
        "INVALID_INPUT",
        "Event reference must point to an existing earlier event",
        422
      )
    return id
  }
  for (const operation of operations) {
    const command = structuredClone(operation.command)
    if ("eventId" in command) command.eventId = resolve(command.eventId)!
    if ("afterEventId" in command)
      command.afterEventId = resolve(command.afterEventId)
    if (command.name === "event.add" || command.name === "event.update") {
      const fields =
        command.name === "event.add" ? command.content : command.patch
      if (fields.transit) {
        if (fields.transit.fromEventId !== undefined)
          fields.transit.fromEventId = resolve(fields.transit.fromEventId)!
        if (fields.transit.toEventId !== undefined)
          fields.transit.toEventId = resolve(fields.transit.toEventId)!
      }
    }
    const parsed = journeyCommandSchema.parse(command)
    await assertJourneyCommandAccess(tx, context, next, parsed)
    if (operation.draftRef && refs.has(operation.draftRef))
      throw new PlanningError("INVALID_INPUT", "Duplicate draftRef", 422)
    const key = operation.draftRef
      ? `${proposalId}:${operation.draftRef}`
      : proposalId
    if (
      operation.draftRef &&
      next.events.some((e) => e.id === recordingId(base.id, key, "event"))
    )
      throw new PlanningError(
        "INVALID_INPUT",
        "Draft event already exists",
        422
      )
    const createdId = await reduceJourneyCommand(
      context,
      next,
      parsed,
      key,
      now,
      tx
    )
    if (operation.draftRef) refs.set(operation.draftRef, createdId!)
    assertJourneyTransition(base, next)
    // Per-command validation permits an intermediate removed endpoint; the final
    // batch below requires all remaining transit references to resolve.
    journeySnapshotSchema.parse(next)
  }
  for (const event of next.events) {
    const transit = event.transit
    if (!transit) continue
    const ids = [transit.fromEventId, transit.toEventId].filter(
      (id): id is string => Boolean(id)
    )
    if (
      ids.some(
        (id) => id === event.id || !next.events.some((e) => e.id === id)
      ) ||
      (ids.length === 2 && ids[0] === ids[1])
    )
      throw new PlanningError(
        "INVALID_INPUT",
        "Remove or relink transit with a deleted endpoint",
        422
      )
  }
  return journeySnapshotSchema.parse(next)
}
export function rebaseConflicts(
  before: JourneySnapshot,
  current: JourneySnapshot,
  operations: PlanningEdit[]
) {
  const conflicts = new Set<string>()
  for (const { command } of operations) {
    const refs = [
      "eventId" in command ? command.eventId : null,
      "afterEventId" in command ? command.afterEventId : null,
    ]
    for (const ref of refs) {
      if (typeof ref !== "string") continue
      const old = before.events.find((e) => e.id === ref),
        next = current.events.find((e) => e.id === ref)
      if (!old) continue
      if (!next) {
        conflicts.add(`Event ${ref} was removed`)
        continue
      }
      if (command.name === "event.update" && command.eventId === ref) {
        for (const field of Object.keys(command.patch))
          if (
            !same(
              old[field as keyof JourneyEvent],
              next[field as keyof JourneyEvent]
            )
          )
            conflicts.add(`Event ${ref} field ${field} changed`)
      } else if (
        !same(summarizePlanningEvent(old), summarizePlanningEvent(next))
      )
        conflicts.add(`Event ${ref} changed`)
      if (
        "afterEventId" in command &&
        command.afterEventId === ref &&
        before.events[before.events.indexOf(old) + 1]?.id !==
          current.events[current.events.indexOf(next) + 1]?.id
      )
        conflicts.add(`Anchor ${ref} changed`)
    }
  }
  return [...conflicts]
}
