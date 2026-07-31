import type { Prisma } from "@prisma/client"
import { prisma } from "@/modules/data/db/prisma"
import type { AuthContext } from "@/modules/auth/server/context"
import { isAdmin } from "@/modules/auth/server/context"
import type {
  CreateJourneyInput,
  JourneyDto,
  JourneyEvent,
} from "@/types/journey"
import { validateJourneyInput } from "@/lib/journeys/validation"
import { journeyInclude, mapJourneyToDto } from "./journey-mapper"

export class JourneyInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "JourneyInputError"
  }
}

export class JourneyRevisionConflictError extends Error {
  constructor(message = "Journey was updated by another session") {
    super(message)
    this.name = "JourneyRevisionConflictError"
  }
}

function validatedJourneyInput(input: unknown): CreateJourneyInput {
  const result = validateJourneyInput(input)
  if (!result.ok) throw new JourneyInputError(result.error)
  return result.data
}

function journeyScopeWhere(context: AuthContext, id: string) {
  return isAdmin(context) ? { id } : { id, ownerId: context.userId }
}

function journeyListWhere(context: AuthContext) {
  return isAdmin(context) ? {} : { ownerId: context.userId }
}

function eventBaseData(journeyId: string, event: JourneyEvent) {
  return {
    id: event.id,
    journeyId,
    ...eventBaseUpdateData(event),
  }
}

function eventBaseUpdateData(event: JourneyEvent) {
  return {
    type: event.type,
    executionStatus:
      ("executionStatus" in event ? event.executionStatus : undefined) ?? null,
    origin: event.origin,
    title: event.title,
    description: event.description ?? null,
    plannedStartAt: event.plannedStartAt
      ? new Date(event.plannedStartAt)
      : null,
    plannedEndAt: event.plannedEndAt ? new Date(event.plannedEndAt) : null,
    actualStartAt: event.actualStartAt ? new Date(event.actualStartAt) : null,
    actualEndAt: event.actualEndAt ? new Date(event.actualEndAt) : null,
  }
}

function locationDetailData(
  detail:
    | Extract<JourneyEvent, { type: "VISIT" }>["detail"]
    | Extract<JourneyEvent, { type: "STAY" }>["detail"]
    | Extract<JourneyEvent, { type: "MEAL" }>["detail"]
    | Extract<JourneyEvent, { type: "ACTIVITY" }>["detail"]
) {
  return {
    plannedPlaceId: detail.plannedPlaceId ?? null,
    actualPlaceId: detail.actualPlaceId ?? null,
    plannedLat: detail.plannedLat,
    plannedLng: detail.plannedLng,
    actualLat: detail.actualLat ?? null,
    actualLng: detail.actualLng ?? null,
    coordinateSystem: detail.coordinateSystem ?? null,
    coordinateProvider: detail.coordinateProvider ?? null,
    providerPlaceId: detail.providerPlaceId ?? null,
    plannedDurationMinutes: detail.plannedDurationMinutes ?? null,
    actualDurationMinutes: detail.actualDurationMinutes ?? null,
  }
}

async function upsertEventDetail(
  tx: Prisma.TransactionClient,
  event: JourneyEvent
) {
  if (event.type === "SECTION") {
    const data = {
      kind: event.detail.kind,
      placeId: event.detail.placeId ?? null,
      lat: event.detail.lat ?? null,
      lng: event.detail.lng ?? null,
      coordinateSystem: event.detail.coordinateSystem ?? null,
      coordinateProvider: event.detail.coordinateProvider ?? null,
      providerPlaceId: event.detail.providerPlaceId ?? null,
    }
    await tx.sectionEventDetail.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, ...data },
      update: data,
    })
    return
  }
  if (event.type === "VISIT") {
    const data = locationDetailData(event.detail)
    await tx.visitEventDetail.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, ...data },
      update: data,
    })
    return
  }
  if (event.type === "STAY") {
    const data = {
      ...locationDetailData(event.detail),
      checkInNote: event.detail.checkInNote ?? null,
    }
    await tx.stayEventDetail.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, ...data },
      update: data,
    })
    return
  }
  if (event.type === "MEAL") {
    const data = {
      ...locationDetailData(event.detail),
      cuisine: event.detail.cuisine ?? null,
    }
    await tx.mealEventDetail.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, ...data },
      update: data,
    })
    return
  }
  if (event.type === "ACTIVITY") {
    const data = {
      ...locationDetailData(event.detail),
      bookingReference: event.detail.bookingReference ?? null,
    }
    await tx.activityEventDetail.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, ...data },
      update: data,
    })
    return
  }
  if (event.type === "TRANSIT") {
    const data = {
      plannedFromEventId: event.detail.plannedFromEventId ?? null,
      plannedToEventId: event.detail.plannedToEventId ?? null,
      actualFromEventId: event.detail.actualFromEventId ?? null,
      actualToEventId: event.detail.actualToEventId ?? null,
      transportMode: event.detail.transportMode,
      requestMode: event.detail.requestMode ?? null,
      preference: event.detail.preference ?? null,
      plannedDepartAt: event.detail.plannedDepartAt
        ? new Date(event.detail.plannedDepartAt)
        : null,
      actualDepartAt: event.detail.actualDepartAt
        ? new Date(event.detail.actualDepartAt)
        : null,
      plannedDurationMinutes: event.detail.plannedDurationMinutes ?? null,
      actualDurationMinutes: event.detail.actualDurationMinutes ?? null,
      plannedDistanceKm: event.detail.plannedDistanceKm ?? null,
      actualDistanceKm: event.detail.actualDistanceKm ?? null,
      plannedCostEstimate: event.detail.plannedCostEstimate ?? null,
      actualCost: event.detail.actualCost ?? null,
      selectedPlanId: event.detail.selectedPlanId ?? null,
      planningStatus: event.detail.planningStatus ?? null,
      planningWarning: event.detail.planningWarning ?? null,
      notes: event.detail.notes ?? null,
    }
    await tx.transitEventDetail.upsert({
      where: { eventId: event.id },
      create: { eventId: event.id, ...data },
      update: data,
    })
    await tx.transitPlan.deleteMany({ where: { transitEventId: event.id } })
    for (const plan of event.detail.plans ?? []) {
      await tx.transitPlan.create({
        data: {
          id: plan.id,
          transitEventId: event.id,
          provider: plan.provider,
          rank: plan.rank,
          label: plan.label,
          strategy: plan.strategy,
          distanceMeters: plan.distanceMeters,
          durationSeconds: plan.durationSeconds,
          fareAmount: plan.fareAmount ?? null,
          trafficBasis: plan.trafficBasis,
          calculatedAt: new Date(plan.calculatedAt),
          validUntil: plan.validUntil ? new Date(plan.validUntil) : null,
          requestFingerprint: plan.requestFingerprint,
          segments: {
            create: plan.segments.map((segment) => ({
              id: segment.id,
              order: segment.order,
              mode: segment.mode,
              fromName: segment.fromName ?? null,
              toName: segment.toName ?? null,
              lineName: segment.lineName ?? null,
              distanceMeters: segment.distanceMeters ?? null,
              durationSeconds: segment.durationSeconds ?? null,
              fareAmount: segment.fareAmount ?? null,
              departAt: segment.departAt ? new Date(segment.departAt) : null,
              arriveAt: segment.arriveAt ? new Date(segment.arriveAt) : null,
              coordinateSystem: segment.coordinateSystem,
              geometryKind: segment.geometryKind,
              positionsJson: JSON.stringify(segment.positions),
              trafficSectionsJson: segment.trafficSections
                ? JSON.stringify(segment.trafficSections)
                : null,
            })),
          },
        },
      })
    }
    return
  }
  await tx.noteEventDetail.upsert({
    where: { eventId: event.id },
    create: { eventId: event.id, body: event.detail.body },
    update: { body: event.detail.body },
  })
}

async function writeEventRelations(
  tx: Prisma.TransactionClient,
  events: readonly JourneyEvent[]
) {
  for (const event of events) {
    await tx.journeyEvent.update({
      where: { id: event.id },
      data: {
        parentEventId: event.parentEventId ?? null,
        replacedByEventId: event.replacedByEventId ?? null,
      },
    })
  }
}

async function writeLinks(
  tx: Prisma.TransactionClient,
  journeyId: string,
  data: CreateJourneyInput
) {
  for (const link of data.links) {
    await tx.journeyEventLink.create({
      data: {
        id: link.id,
        journeyId,
        fromEventId: link.fromEventId,
        toEventId: link.toEventId,
        kind: link.kind,
        branchKey: link.branchKey ?? null,
        rank: link.rank ?? null,
      },
    })
  }
}

async function writeJourneyGraph(
  tx: Prisma.TransactionClient,
  journeyId: string,
  data: CreateJourneyInput
) {
  for (const event of data.events) {
    await tx.journeyEvent.create({ data: eventBaseData(journeyId, event) })
  }
  for (const event of data.events) {
    await upsertEventDetail(tx, event)
  }
  await writeEventRelations(tx, data.events)
  await writeLinks(tx, journeyId, data)
}

async function syncJourneyGraph(
  tx: Prisma.TransactionClient,
  journeyId: string,
  data: CreateJourneyInput
) {
  const nextIds = data.events.map((event) => event.id)
  const foreignIds = await tx.journeyEvent.findMany({
    where: { id: { in: nextIds }, journeyId: { not: journeyId } },
    select: { id: true },
  })
  if (foreignIds.length) {
    throw new JourneyInputError(
      `Event id ${foreignIds[0]!.id} belongs to another journey`
    )
  }
  await tx.journeyEventLink.deleteMany({ where: { journeyId } })
  await tx.journeyEvent.updateMany({
    where: { journeyId },
    data: { parentEventId: null, replacedByEventId: null },
  })

  for (const event of data.events) {
    const create = eventBaseData(journeyId, event)
    await tx.journeyEvent.upsert({
      where: { id: event.id },
      create,
      update: eventBaseUpdateData(event),
    })
  }
  for (const event of data.events) await upsertEventDetail(tx, event)
  await tx.journeyEvent.deleteMany({
    where: { journeyId, id: { notIn: nextIds } },
  })
  await writeEventRelations(tx, data.events)
  await writeLinks(tx, journeyId, data)
}

export async function listJourneys(
  context: AuthContext
): Promise<JourneyDto[]> {
  const journeys = await prisma.journey.findMany({
    where: journeyListWhere(context),
    include: journeyInclude,
    orderBy: { updatedAt: "desc" },
  })
  return journeys.map(mapJourneyToDto)
}

export async function getJourney(
  context: AuthContext,
  id: string
): Promise<JourneyDto | null> {
  const journey = await prisma.journey.findFirst({
    where: journeyScopeWhere(context, id),
    include: journeyInclude,
  })
  return journey ? mapJourneyToDto(journey) : null
}

export async function createJourney(
  context: AuthContext,
  input: unknown
): Promise<JourneyDto> {
  const data = validatedJourneyInput(input)
  return prisma.$transaction(async (tx) => {
    const journey = await tx.journey.create({
      data: {
        id: data.id,
        ownerId: context.userId,
        title: data.title,
        description: data.description ?? null,
        status: data.status,
      },
    })
    await writeJourneyGraph(tx, journey.id, data)
    await tx.journeyEventRevision.create({
      data: {
        journeyId: journey.id,
        journeyRevision: 1,
        operation: "JOURNEY_CREATED",
        patchJson: JSON.stringify(data),
        actorId: context.userId,
      },
    })
    const created = await tx.journey.findUnique({
      where: { id: journey.id },
      include: journeyInclude,
    })
    if (!created) throw new JourneyInputError("Journey not found")
    return mapJourneyToDto(created)
  })
}

export async function updateJourney(
  context: AuthContext,
  id: string,
  input: unknown,
  expectedRevision?: number | null
): Promise<JourneyDto | null> {
  const existing = await getJourney(context, id)
  if (!existing) return null
  const data = validatedJourneyInput(input)
  const existingById = new Map(
    existing.events.map((event) => [event.id, event.type])
  )
  for (const event of data.events) {
    const existingType = existingById.get(event.id)
    if (existingType && existingType !== event.type) {
      throw new JourneyInputError(
        `Event ${event.id} cannot change type; create a replacement event`
      )
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.journey.updateMany({
      where: {
        ...journeyScopeWhere(context, id),
        ...(typeof expectedRevision === "number"
          ? { revision: expectedRevision }
          : {}),
      },
      data: {
        title: data.title,
        description: data.description ?? null,
        status: data.status,
        revision: { increment: 1 },
      },
    })
    if (updated.count === 0) throw new JourneyRevisionConflictError()

    await syncJourneyGraph(tx, id, data)
    const current = await tx.journey.findUnique({
      where: { id },
      select: { revision: true },
    })
    if (!current) throw new JourneyInputError("Journey not found")
    await tx.journeyEventRevision.create({
      data: {
        journeyId: id,
        journeyRevision: current.revision,
        operation: "JOURNEY_GRAPH_UPDATED",
        patchJson: JSON.stringify(data),
        inversePatchJson: JSON.stringify({
          title: existing.title,
          description: existing.description,
          status: existing.status,
          events: existing.events,
          links: existing.links,
        }),
        actorId: context.userId,
      },
    })

    const result = await tx.journey.findUnique({
      where: { id },
      include: journeyInclude,
    })
    return result ? mapJourneyToDto(result) : null
  })
}

export async function deleteJourney(context: AuthContext, id: string) {
  const existing = await prisma.journey.findFirst({
    where: journeyScopeWhere(context, id),
  })
  if (!existing) return false
  await prisma.journey.delete({ where: { id } })
  return true
}
