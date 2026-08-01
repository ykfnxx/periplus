import { randomUUID } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { z } from "zod"
import type { AuthContext } from "@/modules/auth/server/context"
import { isAdmin } from "@/modules/auth/server/context"
import {
  targetActorReferenceSchema,
  targetJourneyRevisionSchema,
  type TargetActorReference,
  type TargetJourneyEvent,
  type TargetJourneyGraphSnapshot,
  type TargetJourneyRevision,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import {
  JourneyGraphValidationError,
  validateJourneyGraph,
  validateJourneyGraphTransition,
} from "./journey-graph-validator"
import { journeyInclude, mapJourneyToGraph } from "./journey-mapper"

const journeyRevisionWriteSchema = z
  .object({
    graph: z.unknown(),
    operation: z.string().trim().min(1),
    patch: z.array(z.unknown()),
    inversePatch: z.array(z.unknown()),
    actor: targetActorReferenceSchema.optional(),
    idempotencyKey: z.string().trim().min(1),
    workspaceRevisionId: z.string().trim().min(1).optional(),
  })
  .strict()

export interface JourneyRevisionWrite {
  graph: TargetJourneyGraphSnapshot
  operation: string
  patch: unknown[]
  inversePatch: unknown[]
  actor?: TargetActorReference
  idempotencyKey: string
  workspaceRevisionId?: string
}

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

export class JourneyIdempotencyConflictError extends Error {
  constructor(message = "Idempotency key was already used with another write") {
    super(message)
    this.name = "JourneyIdempotencyConflictError"
  }
}

function inputError(error: unknown): never {
  if (error instanceof JourneyInputError) throw error
  if (error instanceof JourneyGraphValidationError) {
    throw new JourneyInputError(error.message)
  }
  if (error instanceof z.ZodError) {
    throw new JourneyInputError(
      error.issues
        .map(
          (issue) =>
            `${issue.path.length ? issue.path.join(".") : "input"}: ${issue.message}`
        )
        .join("; ")
    )
  }
  throw error
}

function canonicalizeDateValues(value: unknown, key?: string): unknown {
  if (
    typeof value === "string" &&
    key !== undefined &&
    /(?:At|Until)$/.test(key)
  ) {
    return new Date(value).toISOString()
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeDateValues(item))
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [
        childKey,
        canonicalizeDateValues(child, childKey),
      ])
    )
  }
  return value
}

function canonicalizeGraph(
  graph: TargetJourneyGraphSnapshot
): TargetJourneyGraphSnapshot {
  const canonical = canonicalizeDateValues(graph) as TargetJourneyGraphSnapshot
  const text = (left: string, right: string) => left.localeCompare(right)
  const eventOrder = new Map<string, number>()

  canonical.events.sort(
    (left, right) =>
      text(left.createdAt, right.createdAt) || text(left.id, right.id)
  )
  canonical.events.forEach((event, index) => eventOrder.set(event.id, index))
  canonical.links.sort(
    (left, right) =>
      left.introducedRevision - right.introducedRevision ||
      left.rank - right.rank ||
      text(left.id, right.id)
  )
  canonical.replacements.sort(
    (left, right) => left.revision - right.revision || text(left.id, right.id)
  )
  canonical.branchSelections.sort(
    (left, right) =>
      left.journeyRevision - right.journeyRevision ||
      text(left.createdAt, right.createdAt) ||
      text(left.id, right.id)
  )
  for (const run of canonical.transitPlanningRuns) {
    run.plans.sort(
      (left, right) => left.rank - right.rank || text(left.id, right.id)
    )
    for (const plan of run.plans) {
      plan.segments.sort(
        (left, right) => left.order - right.order || text(left.id, right.id)
      )
    }
  }
  canonical.transitPlanningRuns.sort(
    (left, right) =>
      (eventOrder.get(left.transitEventId) ?? Number.MAX_SAFE_INTEGER) -
        (eventOrder.get(right.transitEventId) ?? Number.MAX_SAFE_INTEGER) ||
      text(left.calculatedAt, right.calculatedAt) ||
      text(left.id, right.id)
  )
  canonical.eventAssetLinks.sort(
    (left, right) =>
      left.introducedRevision - right.introducedRevision ||
      left.rank - right.rank ||
      text(left.id, right.id)
  )
  canonical.observations.sort(
    (left, right) =>
      (eventOrder.get(left.eventId) ?? Number.MAX_SAFE_INTEGER) -
        (eventOrder.get(right.eventId) ?? Number.MAX_SAFE_INTEGER) ||
      text(left.createdAt, right.createdAt) ||
      text(left.id, right.id)
  )
  canonical.eventSourceLinks.sort(
    (left, right) =>
      left.introducedRevision - right.introducedRevision ||
      left.rank - right.rank ||
      text(left.id, right.id)
  )

  return validateJourneyGraph(canonical)
}

function validatedWrite(input: unknown): JourneyRevisionWrite {
  try {
    const value = journeyRevisionWriteSchema.parse(input)
    return {
      ...value,
      graph: canonicalizeGraph(validateJourneyGraph(value.graph)),
    }
  } catch (error) {
    inputError(error)
  }
}

function journeyScopeWhere(
  context: AuthContext,
  id: string,
  includeDeleted = false
) {
  return {
    id,
    ...(isAdmin(context) ? {} : { ownerId: context.userId }),
    ...(includeDeleted ? {} : { deletedAt: null }),
  }
}

function journeyListWhere(context: AuthContext) {
  return {
    ...(isAdmin(context) ? {} : { ownerId: context.userId }),
    deletedAt: null,
  }
}

function defaultActor(context: AuthContext): TargetActorReference {
  return { kind: "USER", userId: context.userId }
}

function actorColumns(actor: TargetActorReference) {
  if (actor.kind === "USER") {
    return {
      actorKind: actor.kind,
      actorUserId: actor.userId,
      actorAgentRunId: null,
    }
  }
  if (actor.kind === "AGENT") {
    return {
      actorKind: actor.kind,
      actorUserId: null,
      actorAgentRunId: actor.agentRunId,
    }
  }
  return {
    actorKind: actor.kind,
    actorUserId: null,
    actorAgentRunId: null,
  }
}

function assertWriteOwner(context: AuthContext, ownerId: string) {
  if (!isAdmin(context) && ownerId !== context.userId) {
    throw new JourneyInputError(
      "Journey owner must match the authenticated user"
    )
  }
}

async function assertActorAuthorized(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  actor: TargetActorReference,
  workspaceRevisionId?: string
) {
  if (actor.kind === "USER") {
    if (actor.userId !== context.userId) {
      throw new JourneyInputError(
        "USER actor must match the authenticated user"
      )
    }
    return
  }
  if (actor.kind === "SYSTEM") {
    throw new JourneyInputError(
      "SYSTEM actor is not available through the authenticated Journey boundary"
    )
  }

  const run = await tx.workspaceAgentRun.findUnique({
    where: { id: actor.agentRunId },
    select: {
      workspaceId: true,
      workspace: { select: { ownerId: true } },
    },
  })
  if (!run || run.workspace.ownerId !== context.userId) {
    throw new JourneyInputError(
      "AGENT actor must reference a WorkspaceAgentRun owned by the authenticated user"
    )
  }
  if (!workspaceRevisionId) return

  const workspaceRevision = await tx.workspaceRevision.findUnique({
    where: { id: workspaceRevisionId },
    select: { workspaceId: true },
  })
  if (!workspaceRevision || workspaceRevision.workspaceId !== run.workspaceId) {
    throw new JourneyInputError(
      "AGENT actor and workspace revision must belong to the same Workspace"
    )
  }
}

async function assertWriteActorsAuthorized(
  tx: Prisma.TransactionClient,
  context: AuthContext,
  write: JourneyRevisionWrite,
  actor: TargetActorReference,
  selections: TargetJourneyGraphSnapshot["branchSelections"]
) {
  await assertActorAuthorized(tx, context, actor, write.workspaceRevisionId)
  for (const selection of selections) {
    await assertActorAuthorized(
      tx,
      context,
      selection.actor,
      write.workspaceRevisionId
    )
  }
}

function json(value: unknown) {
  return JSON.stringify(value)
}

function sameJson(left: unknown, right: unknown) {
  return json(left) === json(right)
}

function readonlyDomainState(graph: TargetJourneyGraphSnapshot) {
  return {
    transitPlanningRuns: graph.transitPlanningRuns,
    eventAssetLinks: graph.eventAssetLinks,
    observations: graph.observations,
    eventSourceLinks: graph.eventSourceLinks,
  }
}

function assertReadonlyDomainsUnchanged(
  previous: TargetJourneyGraphSnapshot,
  next: TargetJourneyGraphSnapshot
) {
  if (!sameJson(readonlyDomainState(previous), readonlyDomainState(next))) {
    throw new JourneyInputError(
      "Journey core cannot mutate Transit run or Content state"
    )
  }
  const previousTransit = new Map(
    previous.events.flatMap((event) =>
      event.type === "TRANSIT"
        ? [
            [
              event.id,
              {
                activePlanningRunId: event.detail.activePlanningRunId,
                selectedPlanId: event.detail.selectedPlanId,
                routeState: event.detail.routeState,
              },
            ] as const,
          ]
        : []
    )
  )
  for (const event of next.events) {
    if (event.type !== "TRANSIT" || !previousTransit.has(event.id)) continue
    const before = previousTransit.get(event.id)!
    const after = {
      activePlanningRunId: event.detail.activePlanningRunId,
      selectedPlanId: event.detail.selectedPlanId,
      routeState: event.detail.routeState,
    }
    if (!sameJson(before, after)) {
      throw new JourneyInputError(
        `Journey core cannot change Transit route selection for Event ${event.id}`
      )
    }
  }
}

function assertCreateDomainsEmpty(graph: TargetJourneyGraphSnapshot) {
  const readonlyState = readonlyDomainState(graph)
  if (Object.values(readonlyState).some((values) => values.length > 0)) {
    throw new JourneyInputError(
      "Journey core create cannot persist Transit run or Content state"
    )
  }
  for (const event of graph.events) {
    if (
      event.type === "TRANSIT" &&
      (event.detail.activePlanningRunId ||
        event.detail.selectedPlanId ||
        event.detail.routeState !== "EMPTY")
    ) {
      throw new JourneyInputError(
        `new Transit Event ${event.id} must start without a route selection`
      )
    }
  }
}

function eventEnvelopeData(
  journeyId: string,
  event: TargetJourneyEvent
): Prisma.JourneyEventUncheckedCreateInput {
  return {
    id: event.id,
    journeyId,
    parentSectionEventId: event.parentSectionEventId,
    type: event.type,
    executionStatus: "executionStatus" in event ? event.executionStatus : null,
    placementStatus: event.placementStatus,
    origin: event.origin,
    title: event.title,
    description: event.description ?? null,
    plannedStartAt:
      "plannedStartAt" in event && event.plannedStartAt
        ? new Date(event.plannedStartAt)
        : null,
    plannedEndAt:
      "plannedEndAt" in event && event.plannedEndAt
        ? new Date(event.plannedEndAt)
        : null,
    actualStartAt:
      "actualStartAt" in event && event.actualStartAt
        ? new Date(event.actualStartAt)
        : null,
    actualEndAt:
      "actualEndAt" in event && event.actualEndAt
        ? new Date(event.actualEndAt)
        : null,
    introducedRevision: event.introducedRevision,
    retiredRevision: event.retiredRevision ?? null,
    createdAt: new Date(event.createdAt),
    updatedAt: new Date(event.updatedAt),
  }
}

function eventEnvelopeUpdateData(
  previous: TargetJourneyEvent,
  event: TargetJourneyEvent
): Prisma.JourneyEventUncheckedUpdateInput {
  const before = eventEnvelopeData(previous.journeyId, previous)
  const after = eventEnvelopeData(event.journeyId, event)
  const changed = (key: keyof typeof after) =>
    json(before[key]) !== json(after[key])
  const data: Prisma.JourneyEventUncheckedUpdateInput = {
    ...(changed("parentSectionEventId")
      ? { parentSectionEventId: after.parentSectionEventId }
      : {}),
    ...(changed("executionStatus")
      ? { executionStatus: after.executionStatus }
      : {}),
    ...(changed("placementStatus")
      ? { placementStatus: after.placementStatus }
      : {}),
    ...(changed("title") ? { title: after.title } : {}),
    ...(changed("description") ? { description: after.description } : {}),
    ...(changed("plannedStartAt")
      ? { plannedStartAt: after.plannedStartAt }
      : {}),
    ...(changed("plannedEndAt") ? { plannedEndAt: after.plannedEndAt } : {}),
    ...(changed("actualStartAt") ? { actualStartAt: after.actualStartAt } : {}),
    ...(changed("actualEndAt") ? { actualEndAt: after.actualEndAt } : {}),
    ...(changed("retiredRevision")
      ? { retiredRevision: after.retiredRevision }
      : {}),
  }
  if (changed("updatedAt") || Object.keys(data).length > 0) {
    data.updatedAt = after.updatedAt
  }
  return data
}

function locationDetailData(
  detail:
    | Extract<TargetJourneyEvent, { type: "VISIT" }>["detail"]
    | Extract<TargetJourneyEvent, { type: "STAY" }>["detail"]
    | Extract<TargetJourneyEvent, { type: "MEAL" }>["detail"]
    | Extract<TargetJourneyEvent, { type: "ACTIVITY" }>["detail"]
) {
  return {
    plannedPlaceId: detail.plannedPlaceId ?? null,
    actualPlaceId: detail.actualPlaceId ?? null,
    plannedLat: detail.plannedLat,
    plannedLng: detail.plannedLng,
    actualLat: detail.actualLat ?? null,
    actualLng: detail.actualLng ?? null,
    coordinateSystem: detail.coordinateSystem,
    coordinateProvider: detail.coordinateProvider ?? null,
    providerPlaceId: detail.providerPlaceId ?? null,
    plannedDurationMinutes: detail.plannedDurationMinutes ?? null,
    actualDurationMinutes: detail.actualDurationMinutes ?? null,
  }
}

function sectionDetailData(
  detail: Extract<TargetJourneyEvent, { type: "SECTION" }>["detail"]
) {
  if (detail.kind === "DAY") {
    return {
      kind: detail.kind,
      localDate: detail.localDate,
      timezone: detail.timezone,
      placeId: null,
      lat: null,
      lng: null,
      coordinateSystem: null,
      sourcePackId: null,
    }
  }
  if (detail.kind === "CITY") {
    return {
      kind: detail.kind,
      localDate: null,
      timezone: null,
      placeId: detail.placeId ?? null,
      lat: detail.lat ?? null,
      lng: detail.lng ?? null,
      coordinateSystem: detail.coordinateSystem ?? null,
      sourcePackId: null,
    }
  }
  return {
    kind: detail.kind,
    localDate: null,
    timezone: null,
    placeId: null,
    lat: null,
    lng: null,
    coordinateSystem: null,
    sourcePackId: detail.sourcePackId ?? null,
  }
}

function transitDetailData(
  detail: Extract<TargetJourneyEvent, { type: "TRANSIT" }>["detail"]
) {
  return {
    plannedFromEventId: detail.plannedFromEventId ?? null,
    plannedToEventId: detail.plannedToEventId ?? null,
    actualFromEventId: detail.actualFromEventId ?? null,
    actualToEventId: detail.actualToEventId ?? null,
    transportMode: detail.transportMode,
    requestMode: detail.requestMode ?? null,
    preference: detail.preference ?? null,
    plannedDepartAt: detail.plannedDepartAt
      ? new Date(detail.plannedDepartAt)
      : null,
    actualDepartAt: detail.actualDepartAt
      ? new Date(detail.actualDepartAt)
      : null,
    plannedDurationMinutes: detail.plannedDurationMinutes ?? null,
    actualDurationMinutes: detail.actualDurationMinutes ?? null,
    plannedDistanceKm: detail.plannedDistanceKm ?? null,
    actualDistanceKm: detail.actualDistanceKm ?? null,
    plannedCostEstimate: detail.plannedCostEstimate ?? null,
    actualCost: detail.actualCost ?? null,
    activePlanningRunId: detail.activePlanningRunId ?? null,
    selectedPlanId: detail.selectedPlanId ?? null,
    routeState: detail.routeState,
    notes: detail.notes ?? null,
  }
}

async function createEventDetail(
  tx: Prisma.TransactionClient,
  event: TargetJourneyEvent
) {
  if (event.type === "SECTION") {
    await tx.sectionEventDetail.create({
      data: { eventId: event.id, ...sectionDetailData(event.detail) },
    })
  } else if (event.type === "VISIT") {
    await tx.visitEventDetail.create({
      data: { eventId: event.id, ...locationDetailData(event.detail) },
    })
  } else if (event.type === "STAY") {
    await tx.stayEventDetail.create({
      data: {
        eventId: event.id,
        ...locationDetailData(event.detail),
        checkInNote: event.detail.checkInNote ?? null,
      },
    })
  } else if (event.type === "MEAL") {
    await tx.mealEventDetail.create({
      data: {
        eventId: event.id,
        ...locationDetailData(event.detail),
        cuisine: event.detail.cuisine ?? null,
      },
    })
  } else if (event.type === "ACTIVITY") {
    await tx.activityEventDetail.create({
      data: {
        eventId: event.id,
        ...locationDetailData(event.detail),
        bookingReference: event.detail.bookingReference ?? null,
      },
    })
  } else if (event.type === "TRANSIT") {
    await tx.transitEventDetail.create({
      data: { eventId: event.id, ...transitDetailData(event.detail) },
    })
  } else {
    await tx.noteEventDetail.create({
      data: { eventId: event.id, body: event.detail.body },
    })
  }
}

async function updateEventDetail(
  tx: Prisma.TransactionClient,
  event: TargetJourneyEvent
) {
  if (event.type === "SECTION") {
    await tx.sectionEventDetail.update({
      where: { eventId: event.id },
      data: sectionDetailData(event.detail),
    })
  } else if (event.type === "VISIT") {
    await tx.visitEventDetail.update({
      where: { eventId: event.id },
      data: locationDetailData(event.detail),
    })
  } else if (event.type === "STAY") {
    await tx.stayEventDetail.update({
      where: { eventId: event.id },
      data: {
        ...locationDetailData(event.detail),
        checkInNote: event.detail.checkInNote ?? null,
      },
    })
  } else if (event.type === "MEAL") {
    await tx.mealEventDetail.update({
      where: { eventId: event.id },
      data: {
        ...locationDetailData(event.detail),
        cuisine: event.detail.cuisine ?? null,
      },
    })
  } else if (event.type === "ACTIVITY") {
    await tx.activityEventDetail.update({
      where: { eventId: event.id },
      data: {
        ...locationDetailData(event.detail),
        bookingReference: event.detail.bookingReference ?? null,
      },
    })
  } else if (event.type === "TRANSIT") {
    await tx.transitEventDetail.update({
      where: { eventId: event.id },
      data: transitDetailData(event.detail),
    })
  } else {
    await tx.noteEventDetail.update({
      where: { eventId: event.id },
      data: { body: event.detail.body },
    })
  }
}

function containmentOrder(events: readonly TargetJourneyEvent[]) {
  const byId = new Map(events.map((event) => [event.id, event]))
  const depth = (event: TargetJourneyEvent): number => {
    const parent = event.parentSectionEventId
      ? byId.get(event.parentSectionEventId)
      : undefined
    return parent ? depth(parent) + 1 : 0
  }
  return [...events].sort(
    (left, right) =>
      depth(left) - depth(right) || left.id.localeCompare(right.id)
  )
}

function dependencySafeEventUpdateOrder(
  previousEvents: ReadonlyMap<string, TargetJourneyEvent>,
  events: readonly TargetJourneyEvent[]
) {
  const ordered = containmentOrder(
    events.filter((event) => previousEvents.has(event.id))
  )
  const restoring: TargetJourneyEvent[] = []
  const regular: TargetJourneyEvent[] = []
  const retiring: TargetJourneyEvent[] = []

  for (const event of ordered) {
    const previous = previousEvents.get(event.id)!
    if (
      previous.retiredRevision !== undefined &&
      event.retiredRevision === undefined
    ) {
      restoring.push(event)
    } else if (
      previous.retiredRevision === undefined &&
      event.retiredRevision !== undefined
    ) {
      retiring.push(event)
    } else {
      regular.push(event)
    }
  }

  return [...restoring, ...regular, ...retiring.reverse()]
}

function temporaryLinkParkingEndpoints(
  previous: TargetJourneyGraphSnapshot,
  nextEventsById: ReadonlyMap<string, TargetJourneyEvent>,
  topologyChangedEventIds: ReadonlySet<string>
) {
  const candidates = previous.events
    .filter((event) => {
      const next = nextEventsById.get(event.id)
      return (
        next !== undefined &&
        !topologyChangedEventIds.has(event.id) &&
        event.placementStatus === "SCHEDULED" &&
        event.retiredRevision === undefined &&
        next.placementStatus === "SCHEDULED" &&
        next.retiredRevision === undefined &&
        event.parentSectionEventId === next.parentSectionEventId
      )
    })
    .sort((left, right) => left.id.localeCompare(right.id))

  for (const from of candidates) {
    const to = candidates.find(
      (candidate) =>
        candidate.id !== from.id &&
        candidate.parentSectionEventId === from.parentSectionEventId
    )
    if (to) return { fromEventId: from.id, toEventId: to.id }
  }
  throw new JourneyInputError(
    "selected Link topology change requires two stable active Events in one scope"
  )
}

function revisionSignature(
  write: JourneyRevisionWrite,
  actor: TargetActorReference
) {
  return {
    operation: write.operation,
    snapshotJson: json(write.graph),
    patchJson: json(write.patch),
    inversePatchJson: json(write.inversePatch),
    ...actorColumns(actor),
    workspaceRevisionId: write.workspaceRevisionId ?? null,
  }
}

function samePersistedRevision(
  revision: {
    operation: string
    snapshotJson: string
    patchJson: string
    inversePatchJson: string
    actorKind: string
    actorUserId: string | null
    actorAgentRunId: string | null
    workspaceRevisionId: string | null
  },
  signature: ReturnType<typeof revisionSignature>
) {
  return (
    revision.operation === signature.operation &&
    revision.snapshotJson === signature.snapshotJson &&
    revision.patchJson === signature.patchJson &&
    revision.inversePatchJson === signature.inversePatchJson &&
    revision.actorKind === signature.actorKind &&
    revision.actorUserId === signature.actorUserId &&
    revision.actorAgentRunId === signature.actorAgentRunId &&
    revision.workspaceRevisionId === signature.workspaceRevisionId
  )
}

function graphFromRevisionJson(value: string) {
  try {
    return validateJourneyGraph(JSON.parse(value))
  } catch (error) {
    inputError(error)
  }
}

async function findIdempotentRevision(
  tx: Prisma.TransactionClient,
  journeyId: string,
  write: JourneyRevisionWrite,
  actor: TargetActorReference
) {
  const revision = await tx.journeyRevision.findUnique({
    where: {
      journeyId_idempotencyKey: {
        journeyId,
        idempotencyKey: write.idempotencyKey,
      },
    },
  })
  if (!revision) return null
  if (!samePersistedRevision(revision, revisionSignature(write, actor))) {
    throw new JourneyIdempotencyConflictError()
  }
  return graphFromRevisionJson(revision.snapshotJson)
}

async function createRevision(
  tx: Prisma.TransactionClient,
  write: JourneyRevisionWrite,
  actor: TargetActorReference,
  parentRevisionId: string | null
) {
  await tx.journeyRevision.create({
    data: {
      id: randomUUID(),
      journeyId: write.graph.id,
      revision: write.graph.revision,
      operation: write.operation,
      snapshotJson: json(write.graph),
      patchJson: json(write.patch),
      inversePatchJson: json(write.inversePatch),
      ...actorColumns(actor),
      idempotencyKey: write.idempotencyKey,
      parentRevisionId,
      workspaceRevisionId: write.workspaceRevisionId ?? null,
    },
  })
}

async function createLinks(
  tx: Prisma.TransactionClient,
  links: TargetJourneyGraphSnapshot["links"]
) {
  for (const link of links) {
    await tx.journeyEventLink.create({
      data: {
        id: link.id,
        journeyId: link.journeyId,
        fromEventId: link.fromEventId,
        toEventId: link.toEventId,
        kind: link.kind,
        branchKey: link.branchKey ?? null,
        rank: link.rank,
        introducedRevision: link.introducedRevision,
        retiredRevision: link.retiredRevision ?? null,
      },
    })
  }
}

async function createSelections(
  tx: Prisma.TransactionClient,
  selections: TargetJourneyGraphSnapshot["branchSelections"]
) {
  for (const selection of selections) {
    await tx.journeyBranchSelection.create({
      data: {
        id: selection.id,
        journeyId: selection.journeyId,
        forkEventId: selection.forkEventId,
        selectedLinkId: selection.selectedLinkId,
        journeyRevision: selection.journeyRevision,
        supersedesId: selection.supersedesId ?? null,
        ...actorColumns(selection.actor),
        reason: selection.reason ?? null,
        createdAt: new Date(selection.createdAt),
      },
    })
  }
}

function hasPrismaCode(error: unknown, code: string) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  )
}

export async function listJourneys(
  context: AuthContext
): Promise<TargetJourneyGraphSnapshot[]> {
  const journeys = await prisma.journey.findMany({
    where: journeyListWhere(context),
    include: journeyInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
  })
  return journeys.map(mapJourneyToGraph)
}

export async function getJourney(
  context: AuthContext,
  id: string,
  options: { includeDeleted?: boolean } = {}
): Promise<TargetJourneyGraphSnapshot | null> {
  const journey = await prisma.journey.findFirst({
    where: journeyScopeWhere(context, id, options.includeDeleted),
    include: journeyInclude,
  })
  return journey ? mapJourneyToGraph(journey) : null
}

export async function createJourney(
  context: AuthContext,
  input: unknown
): Promise<TargetJourneyGraphSnapshot> {
  const write = validatedWrite(input)
  const actor = write.actor ?? defaultActor(context)
  if (write.graph.revision !== 1) {
    throw new JourneyInputError("new Journey must start at revision 1")
  }
  assertWriteOwner(context, write.graph.ownerId)
  assertCreateDomainsEmpty(write.graph)

  try {
    return await prisma.$transaction(async (tx) => {
      await assertWriteActorsAuthorized(
        tx,
        context,
        write,
        actor,
        write.graph.branchSelections
      )
      const existing = await tx.journey.findUnique({
        where: { id: write.graph.id },
        select: { id: true, ownerId: true },
      })
      if (existing) {
        assertWriteOwner(context, existing.ownerId)
        const replay = await findIdempotentRevision(
          tx,
          write.graph.id,
          write,
          actor
        )
        if (replay) return replay
        throw new JourneyInputError("Journey id already exists")
      }

      await tx.journey.create({
        data: {
          id: write.graph.id,
          ownerId: write.graph.ownerId,
          revision: 1,
          status: write.graph.status,
          visibility: write.graph.visibility,
          title: write.graph.title,
          description: write.graph.description ?? null,
          deletedAt: write.graph.deletedAt
            ? new Date(write.graph.deletedAt)
            : null,
        },
      })
      await createRevision(tx, write, actor, null)

      for (const event of containmentOrder(write.graph.events)) {
        await tx.journeyEvent.create({
          data: eventEnvelopeData(write.graph.id, event),
        })
        await tx.journeyEvent.update({
          where: { id: event.id },
          data: { updatedAt: new Date(event.updatedAt) },
        })
      }
      for (const event of write.graph.events) {
        await createEventDetail(tx, event)
      }
      await createLinks(tx, write.graph.links)
      for (const replacement of write.graph.replacements) {
        await tx.journeyEventReplacement.create({ data: replacement })
      }
      await createSelections(tx, write.graph.branchSelections)

      return graphFromRevisionJson(json(write.graph))
    })
  } catch (error) {
    if (
      error instanceof JourneyInputError ||
      error instanceof JourneyIdempotencyConflictError
    ) {
      throw error
    }
    if (hasPrismaCode(error, "P2002")) {
      throw new JourneyRevisionConflictError()
    }
    throw error
  }
}

export async function commitJourneyGraph(
  context: AuthContext,
  id: string,
  input: unknown,
  expectedRevision?: number | null
): Promise<TargetJourneyGraphSnapshot | null> {
  const write = validatedWrite(input)
  const actor = write.actor ?? defaultActor(context)
  if (write.graph.id !== id) {
    throw new JourneyInputError("write graph must match Journey id")
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const record = await tx.journey.findFirst({
        where: journeyScopeWhere(context, id, true),
        include: journeyInclude,
      })
      if (!record) return null
      assertWriteOwner(context, record.ownerId)
      await assertActorAuthorized(tx, context, actor, write.workspaceRevisionId)

      const replay = await findIdempotentRevision(tx, id, write, actor)
      if (replay) return replay

      const previous = mapJourneyToGraph(record)
      if (
        typeof expectedRevision === "number" &&
        previous.revision !== expectedRevision
      ) {
        throw new JourneyRevisionConflictError()
      }
      if (write.graph.revision !== previous.revision + 1) {
        throw new JourneyRevisionConflictError()
      }

      let next: TargetJourneyGraphSnapshot
      try {
        next = validateJourneyGraphTransition(previous, write.graph)
        assertReadonlyDomainsUnchanged(previous, next)
      } catch (error) {
        inputError(error)
      }

      const previousSelections = new Set(
        previous.branchSelections.map((selection) => selection.id)
      )
      const newSelections = next.branchSelections.filter(
        (selection) => !previousSelections.has(selection.id)
      )
      for (const selection of newSelections) {
        await assertActorAuthorized(
          tx,
          context,
          selection.actor,
          write.workspaceRevisionId
        )
      }

      const parentRevision = await tx.journeyRevision.findUnique({
        where: {
          journeyId_revision: {
            journeyId: id,
            revision: previous.revision,
          },
        },
        select: { id: true },
      })
      if (!parentRevision) {
        throw new JourneyRevisionConflictError(
          "Journey head has no persisted parent revision"
        )
      }
      await createRevision(tx, write, actor, parentRevision.id)

      const previousEvents = new Map(
        previous.events.map((event) => [event.id, event])
      )
      const newEvents = containmentOrder(
        next.events.filter((event) => !previousEvents.has(event.id))
      )
      for (const event of newEvents) {
        await tx.journeyEvent.create({
          data: eventEnvelopeData(id, event),
        })
        await tx.journeyEvent.update({
          where: { id: event.id },
          data: { updatedAt: new Date(event.updatedAt) },
        })
      }
      for (const event of newEvents) await createEventDetail(tx, event)

      const previousLinks = new Map(
        previous.links.map((link) => [link.id, link])
      )
      const newLinks = next.links.filter((link) => !previousLinks.has(link.id))
      const linksNeededBySelections = new Set(
        newSelections.map((selection) => selection.selectedLinkId)
      )
      await createLinks(
        tx,
        newLinks.filter((link) => linksNeededBySelections.has(link.id))
      )
      await createSelections(
        tx,
        newSelections.filter(
          (selection) =>
            previousLinks.has(selection.selectedLinkId) ||
            linksNeededBySelections.has(selection.selectedLinkId)
        )
      )

      const currentTargetSelections = new Set(
        next.branchSelections
          .filter(
            (selection) =>
              !next.branchSelections.some(
                (candidate) => candidate.supersedesId === selection.id
              )
          )
          .map((selection) => selection.selectedLinkId)
      )
      const nextEventsById = new Map(
        next.events.map((event) => [event.id, event])
      )
      const topologyChangedEventIds = new Set(
        previous.events
          .filter((event) => {
            const current = nextEventsById.get(event.id)!
            return (
              event.parentSectionEventId !== current.parentSectionEventId ||
              event.placementStatus !== current.placementStatus ||
              event.retiredRevision !== current.retiredRevision
            )
          })
          .map((event) => event.id)
      )
      const structurallyChangedLinks = next.links.filter((link) => {
        const before = previousLinks.get(link.id)
        return (
          before !== undefined &&
          (before.fromEventId !== link.fromEventId ||
            before.toEventId !== link.toEventId ||
            before.kind !== link.kind ||
            before.branchKey !== link.branchKey)
        )
      })
      const structurallyChangedLinkIds = new Set(
        structurallyChangedLinks.map((link) => link.id)
      )

      const linksToSuspend = next.links.filter((link) => {
        const before = previousLinks.get(link.id)
        return (
          before !== undefined &&
          before.retiredRevision === undefined &&
          (link.retiredRevision !== undefined ||
            structurallyChangedLinkIds.has(link.id) ||
            topologyChangedEventIds.has(link.fromEventId) ||
            topologyChangedEventIds.has(link.toEventId))
        )
      })
      const parkedLinkIds = new Set(
        linksToSuspend
          .filter((link) => currentTargetSelections.has(link.id))
          .map((link) => link.id)
      )
      const retiredForMoveLinkIds = new Set(
        linksToSuspend
          .filter((link) => !parkedLinkIds.has(link.id))
          .map((link) => link.id)
      )
      if (parkedLinkIds.size > 0) {
        const parking = temporaryLinkParkingEndpoints(
          previous,
          nextEventsById,
          topologyChangedEventIds
        )
        for (const link of linksToSuspend.filter((candidate) =>
          parkedLinkIds.has(candidate.id)
        )) {
          await tx.journeyEventLink.update({
            where: { id: link.id },
            data: {
              ...parking,
              kind: "ALTERNATIVE",
              branchKey: `__temporary_move__:${link.id}`,
            },
          })
        }
      }
      for (const link of linksToSuspend.filter((candidate) =>
        retiredForMoveLinkIds.has(candidate.id)
      )) {
        await tx.journeyEventLink.update({
          where: { id: link.id },
          data: { retiredRevision: next.revision },
        })
      }

      for (const event of dependencySafeEventUpdateOrder(
        previousEvents,
        next.events
      )) {
        const data = eventEnvelopeUpdateData(
          previousEvents.get(event.id)!,
          event
        )
        if (Object.keys(data).length > 0) {
          await tx.journeyEvent.update({ where: { id: event.id }, data })
        }
      }
      for (const event of next.events) {
        if (!previousEvents.has(event.id)) continue
        await updateEventDetail(tx, event)
      }

      for (const link of next.links) {
        const before = previousLinks.get(link.id)
        if (!before) continue
        await tx.journeyEventLink.update({
          where: { id: link.id },
          data: {
            fromEventId: link.fromEventId,
            toEventId: link.toEventId,
            kind: link.kind,
            branchKey: link.branchKey ?? null,
            rank: link.rank,
            retiredRevision:
              link.retiredRevision ??
              (retiredForMoveLinkIds.has(link.id) ? next.revision : null),
          },
        })
      }

      await createLinks(
        tx,
        newLinks.filter((link) => !linksNeededBySelections.has(link.id))
      )

      for (const link of next.links) {
        if (
          !previousLinks.has(link.id) ||
          link.retiredRevision !== undefined ||
          !retiredForMoveLinkIds.has(link.id)
        ) {
          continue
        }
        await tx.journeyEventLink.update({
          where: { id: link.id },
          data: { retiredRevision: null },
        })
      }

      const previousReplacementIds = new Set(
        previous.replacements.map((replacement) => replacement.id)
      )
      for (const replacement of next.replacements) {
        if (previousReplacementIds.has(replacement.id)) continue
        await tx.journeyEventReplacement.create({ data: replacement })
      }

      const updated = await tx.journey.updateMany({
        where: {
          id,
          ownerId: record.ownerId,
          revision: previous.revision,
        },
        data: {
          revision: next.revision,
          status: next.status,
          visibility: next.visibility,
          title: next.title,
          description: next.description ?? null,
          deletedAt: next.deletedAt ? new Date(next.deletedAt) : null,
        },
      })
      if (updated.count !== 1) throw new JourneyRevisionConflictError()

      return graphFromRevisionJson(json(next))
    })
  } catch (error) {
    if (
      error instanceof JourneyInputError ||
      error instanceof JourneyIdempotencyConflictError ||
      error instanceof JourneyRevisionConflictError
    ) {
      throw error
    }
    if (hasPrismaCode(error, "P2002")) {
      throw new JourneyRevisionConflictError()
    }
    throw error
  }
}

export async function updateJourney(
  context: AuthContext,
  id: string,
  input: unknown,
  expectedRevision?: number | null
) {
  return commitJourneyGraph(context, id, input, expectedRevision)
}

export async function deleteJourney(context: AuthContext, id: string) {
  const current = await getJourney(context, id, { includeDeleted: true })
  if (!current) return false
  if (current.deletedAt) return true
  const deletedAt = new Date().toISOString()
  const result = await commitJourneyGraph(
    context,
    id,
    {
      graph: {
        ...current,
        revision: current.revision + 1,
        deletedAt,
      },
      operation: "JOURNEY_SOFT_DELETED",
      patch: [{ op: "add", path: "/deletedAt", value: deletedAt }],
      inversePatch: [{ op: "remove", path: "/deletedAt" }],
      idempotencyKey: `journey-soft-delete:${id}:${current.revision}`,
    },
    current.revision
  )
  return result !== null
}

export async function getJourneyRevision(
  context: AuthContext,
  journeyId: string,
  revision: number
): Promise<TargetJourneyRevision | null> {
  const journey = await prisma.journey.findFirst({
    where: journeyScopeWhere(context, journeyId, true),
    select: { id: true },
  })
  if (!journey) return null
  const record = await prisma.journeyRevision.findUnique({
    where: { journeyId_revision: { journeyId, revision } },
  })
  if (!record) return null
  return targetJourneyRevisionSchema.parse({
    id: record.id,
    journeyId: record.journeyId,
    revision: record.revision,
    operation: record.operation,
    snapshot: JSON.parse(record.snapshotJson),
    patch: JSON.parse(record.patchJson),
    inversePatch: JSON.parse(record.inversePatchJson),
    actor:
      record.actorKind === "USER"
        ? { kind: "USER", userId: record.actorUserId }
        : record.actorKind === "AGENT"
          ? { kind: "AGENT", agentRunId: record.actorAgentRunId }
          : { kind: "SYSTEM" },
    idempotencyKey: record.idempotencyKey,
    parentRevisionId: record.parentRevisionId ?? undefined,
    workspaceRevisionId: record.workspaceRevisionId ?? undefined,
    createdAt: record.createdAt.toISOString(),
  })
}
