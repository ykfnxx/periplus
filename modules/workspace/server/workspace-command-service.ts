import { createHash } from "node:crypto"
import type { AuthContext } from "@/modules/auth/server/context"
import { PermissionDeniedError } from "@/modules/auth/server/context"
import {
  requestModeForTransport,
  transitPlanFingerprint,
  type TransitPlanBundle,
  type TransitPlanRequest,
} from "@/lib/journeys/planning"
import {
  targetCommandEnvelopeSchema,
  targetCommandResultSchema,
  type TargetCommandEnvelope,
  type TargetCommandResult,
  type TargetJourneyEvent,
  type TargetJourneyEventCreate,
  type TargetJourneyEventLink,
  type TargetJourneyGraphSnapshot,
  type TargetTransitPlanningRun,
  type TargetWorkspaceDocument,
  type TargetWorkspaceRevision,
} from "@/modules/data-model/contracts"
import { prisma } from "@/modules/data/db/prisma"
import { getAsset } from "@/modules/data/content/content-repository"
import { validateJourneyGraph } from "@/modules/data/journeys/journey-graph-validator"
import {
  appendWorkspaceRevision,
  getWorkspaceDocument,
  getWorkspaceRevision,
  getWorkspaceRevisionByIdempotencyKey,
  WorkspaceIdempotencyConflictError,
  WorkspaceInputError,
  WorkspaceRevisionConflictError,
} from "@/modules/data/workspaces/workspace-repository"
import { transitPlanningService } from "@/modules/data/transit/transit-planning-service"
import type { TransitPlanUsageContext } from "@/modules/data/transit/transit-planning-service"

type JourneyCommand = Extract<
  TargetCommandEnvelope["command"],
  { name: `journey.${string}` }
>

interface StoredCommandPatchEntry {
  op: "command"
  commandEnvelope: TargetCommandEnvelope
  changedEventIds: string[]
  projectionInvalidationScopes: Array<string | null>
}

type StoredCommandPatch = [StoredCommandPatchEntry]

interface ExecuteOptions {
  now?: Date
}

interface WorkspaceCommandDependencies {
  transitPlanning?: {
    plan(
      request: TransitPlanRequest,
      usageContext?: TransitPlanUsageContext
    ): Promise<TransitPlanBundle>
  }
}

export class WorkspaceCommandUnsupportedError extends WorkspaceInputError {
  constructor(commandName: TargetCommandEnvelope["command"]["name"]) {
    super(`Command ${commandName} is not implemented by the P3 Workspace bus`)
    this.name = "WorkspaceCommandUnsupportedError"
  }
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function json(value: unknown) {
  return JSON.stringify(value)
}

function deterministicId(envelope: TargetCommandEnvelope, label: string) {
  const digest = createHash("sha256")
    .update(`${envelope.aggregateId}:${envelope.idempotencyKey}:${label}`)
    .digest("hex")
    .slice(0, 24)
  return `cmd-${digest}`
}

function timestampAfter(timestamp: string, previous?: string) {
  if (!previous || Date.parse(timestamp) > Date.parse(previous))
    return timestamp
  return new Date(Date.parse(previous) + 1).toISOString()
}

function activeAtRevision(
  value: { introducedRevision: number; retiredRevision?: number | null },
  revision: number
) {
  return (
    value.introducedRevision <= revision &&
    (!value.retiredRevision || value.retiredRevision > revision)
  )
}

function activeEvents(graph: TargetJourneyGraphSnapshot) {
  return graph.events.filter(
    (event) =>
      event.placementStatus === "SCHEDULED" &&
      activeAtRevision(event, graph.revision)
  )
}

function activeLinks(graph: TargetJourneyGraphSnapshot) {
  return graph.links.filter((link) => activeAtRevision(link, graph.revision))
}

function requireEvent(graph: TargetJourneyGraphSnapshot, eventId: string) {
  const event = graph.events.find((candidate) => candidate.id === eventId)
  if (!event || !activeAtRevision(event, graph.revision)) {
    throw new WorkspaceInputError(`Active Event ${eventId} was not found`)
  }
  return event
}

function requireLink(graph: TargetJourneyGraphSnapshot, linkId: string) {
  const link = graph.links.find((candidate) => candidate.id === linkId)
  if (!link || !activeAtRevision(link, graph.revision)) {
    throw new WorkspaceInputError(`Active Link ${linkId} was not found`)
  }
  return link
}

function graphCandidateRevision(document: TargetWorkspaceDocument) {
  return document.session.headGraph.revision + 1
}

function prepareCandidateGraph(document: TargetWorkspaceDocument) {
  const graph = clone(document.session.headGraph)
  graph.revision = graphCandidateRevision(document)
  return graph
}

function buildEvent(
  graph: TargetJourneyGraphSnapshot,
  create: TargetJourneyEventCreate,
  envelope: TargetCommandEnvelope,
  now: string,
  parentSectionEventId: string | null,
  placementStatus: "SCHEDULED" | "UNSCHEDULED"
): TargetJourneyEvent {
  return {
    ...create,
    id: create.id ?? deterministicId(envelope, "event"),
    journeyId: graph.id,
    parentSectionEventId,
    placementStatus,
    introducedRevision: graph.revision,
    createdAt: now,
    updatedAt: now,
  } as TargetJourneyEvent
}

function addLink(
  graph: TargetJourneyGraphSnapshot,
  envelope: TargetCommandEnvelope,
  label: string,
  input: Omit<TargetJourneyEventLink, "id" | "journeyId" | "introducedRevision">
) {
  const link: TargetJourneyEventLink = {
    ...input,
    id: deterministicId(envelope, label),
    journeyId: graph.id,
    introducedRevision: graph.revision,
  }
  graph.links.push(link)
  return link
}

function currentSelection(
  graph: TargetJourneyGraphSnapshot,
  forkEventId: string
) {
  const superseded = new Set(
    graph.branchSelections.flatMap((selection) =>
      selection.supersedesId ? [selection.supersedesId] : []
    )
  )
  return graph.branchSelections.find(
    (selection) =>
      selection.forkEventId === forkEventId && !superseded.has(selection.id)
  )
}

function insertionParent(
  graph: TargetJourneyGraphSnapshot,
  position: Extract<
    Extract<
      JourneyCommand,
      { name: "journey.add_event" }
    >["payload"]["position"],
    { placement: Exclude<string, "UNSCHEDULED"> }
  >
) {
  if (position.placement === "START" || position.placement === "END") {
    return position.parentSectionEventId
  }
  if (position.placement === "BEFORE" || position.placement === "AFTER") {
    return requireEvent(graph, position.anchorEventId).parentSectionEventId
  }
  if (position.placement === "BRANCH") {
    const fork = requireEvent(graph, position.forkEventId)
    const join = requireEvent(graph, position.joinEventId)
    if (fork.parentSectionEventId !== join.parentSectionEventId) {
      throw new WorkspaceInputError("Branch fork and join must share a scope")
    }
    return fork.parentSectionEventId
  }
  return null
}

function reorderLinearScope(
  graph: TargetJourneyGraphSnapshot,
  event: TargetJourneyEvent,
  position: Extract<
    JourneyCommand,
    { name: "journey.add_event" | "journey.move_event" | "journey.place_event" }
  >["payload"]["position"]
) {
  if (
    event.placementStatus !== "SCHEDULED" ||
    position.placement === "UNSCHEDULED" ||
    position.placement === "BRANCH"
  ) {
    return false
  }
  const targetParent = insertionParent(graph, position as never)
  if (targetParent !== event.parentSectionEventId) return false
  const scopedEvents = activeEvents(graph).filter(
    (candidate) => candidate.parentSectionEventId === targetParent
  )
  const scopedIds = new Set(scopedEvents.map((candidate) => candidate.id))
  const scopedLinks = activeLinks(graph).filter(
    (link) => scopedIds.has(link.fromEventId) && scopedIds.has(link.toEventId)
  )
  if (scopedLinks.length !== Math.max(0, scopedEvents.length - 1)) return false

  const incoming = new Map(scopedEvents.map((candidate) => [candidate.id, 0]))
  const outgoing = new Map<string, TargetJourneyEventLink>()
  for (const link of scopedLinks) {
    if (link.kind !== "MAIN" || outgoing.has(link.fromEventId)) return false
    outgoing.set(link.fromEventId, link)
    incoming.set(link.toEventId, (incoming.get(link.toEventId) ?? 0) + 1)
    if ((incoming.get(link.toEventId) ?? 0) > 1) return false
  }
  const roots = scopedEvents.filter(
    (candidate) => incoming.get(candidate.id) === 0
  )
  if (roots.length !== (scopedEvents.length ? 1 : 0)) return false
  const order: string[] = []
  const linkOrder: TargetJourneyEventLink[] = []
  let cursor = roots[0]?.id
  while (cursor) {
    if (order.includes(cursor)) return false
    order.push(cursor)
    const link = outgoing.get(cursor)
    if (!link) break
    linkOrder.push(link)
    cursor = link.toEventId
  }
  if (order.length !== scopedEvents.length || !order.includes(event.id)) {
    return false
  }

  const nextOrder = order.filter((eventId) => eventId !== event.id)
  if (position.placement === "START") nextOrder.unshift(event.id)
  if (position.placement === "END") nextOrder.push(event.id)
  if (position.placement === "BEFORE" || position.placement === "AFTER") {
    const anchorIndex = nextOrder.indexOf(position.anchorEventId)
    if (anchorIndex < 0) return false
    nextOrder.splice(
      position.placement === "BEFORE" ? anchorIndex : anchorIndex + 1,
      0,
      event.id
    )
  }
  for (const [index, link] of linkOrder.entries()) {
    link.fromEventId = nextOrder[index]!
    link.toEventId = nextOrder[index + 1]!
    link.rank = (index + 1) * 1024
  }
  return true
}

function positionEvent(
  graph: TargetJourneyGraphSnapshot,
  event: TargetJourneyEvent,
  position: Extract<
    JourneyCommand,
    { name: "journey.add_event" | "journey.move_event" | "journey.place_event" }
  >["payload"]["position"],
  envelope: TargetCommandEnvelope
) {
  if (reorderLinearScope(graph, event, position)) return
  const candidateRevision = graph.revision
  const incident = activeLinks(graph).filter(
    (link) => link.fromEventId === event.id || link.toEventId === event.id
  )
  const incoming = incident.filter((link) => link.toEventId === event.id)
  const outgoing = incident.filter((link) => link.fromEventId === event.id)
  if (incoming.length > 1 || outgoing.length > 1) {
    throw new WorkspaceInputError(
      `Event ${event.id} requires explicit Link commands before moving a fork or join`
    )
  }

  if (incoming[0] && outgoing[0]) {
    incoming[0].toEventId = outgoing[0].toEventId
    outgoing[0].retiredRevision = candidateRevision
  } else {
    for (const link of incident) link.retiredRevision = candidateRevision
  }

  if (position.placement === "UNSCHEDULED") {
    event.placementStatus = "UNSCHEDULED"
    event.parentSectionEventId = null
    return
  }

  const parentSectionEventId = insertionParent(graph, position as never)
  event.placementStatus = "SCHEDULED"
  event.parentSectionEventId = parentSectionEventId
  const scopedEvents = activeEvents(graph).filter(
    (candidate) =>
      candidate.id !== event.id &&
      candidate.parentSectionEventId === parentSectionEventId
  )
  const scopedEventIds = new Set(scopedEvents.map((candidate) => candidate.id))
  const scopedLinks = activeLinks(graph).filter(
    (link) =>
      scopedEventIds.has(link.fromEventId) && scopedEventIds.has(link.toEventId)
  )

  if (position.placement === "BRANCH") {
    addLink(graph, envelope, "branch-start-link", {
      fromEventId: position.forkEventId,
      toEventId: event.id,
      kind: "ALTERNATIVE",
      branchKey: position.branchKey,
      rank: Math.max(
        1024,
        ...activeLinks(graph)
          .filter((link) => link.fromEventId === position.forkEventId)
          .map((link) => link.rank + 1024)
      ),
    })
    addLink(graph, envelope, "branch-end-link", {
      fromEventId: event.id,
      toEventId: position.joinEventId,
      kind: "ALTERNATIVE",
      branchKey: position.branchKey,
      rank: 1024,
    })
    return
  }

  const incomingByEvent = new Map(
    scopedEvents.map((candidate) => [candidate.id, 0])
  )
  const outgoingByEvent = new Map(
    scopedEvents.map((candidate) => [candidate.id, 0])
  )
  for (const link of scopedLinks) {
    incomingByEvent.set(
      link.toEventId,
      (incomingByEvent.get(link.toEventId) ?? 0) + 1
    )
    outgoingByEvent.set(
      link.fromEventId,
      (outgoingByEvent.get(link.fromEventId) ?? 0) + 1
    )
  }
  const roots = scopedEvents.filter(
    (candidate) => incomingByEvent.get(candidate.id) === 0
  )
  const sinks = scopedEvents.filter(
    (candidate) => outgoingByEvent.get(candidate.id) === 0
  )

  if (position.placement === "START") {
    if (roots.length > 1) {
      throw new WorkspaceInputError("START insertion requires one scoped root")
    }
    if (roots[0]) {
      addLink(graph, envelope, "start-link", {
        fromEventId: event.id,
        toEventId: roots[0].id,
        kind: "MAIN",
        rank: 1024,
      })
    }
    return
  }
  if (position.placement === "END") {
    if (sinks.length > 1) {
      throw new WorkspaceInputError("END insertion requires one scoped sink")
    }
    if (sinks[0]) {
      addLink(graph, envelope, "end-link", {
        fromEventId: sinks[0].id,
        toEventId: event.id,
        kind: "MAIN",
        rank: Math.max(1024, ...scopedLinks.map((link) => link.rank + 1024)),
      })
    }
    return
  }

  const anchor = requireEvent(graph, position.anchorEventId)
  if (anchor.parentSectionEventId !== parentSectionEventId) {
    throw new WorkspaceInputError("Anchor must remain in the insertion scope")
  }
  if (position.placement === "BEFORE") {
    const anchorIncoming = scopedLinks.filter(
      (link) => link.toEventId === anchor.id
    )
    if (anchorIncoming.length > 1) {
      throw new WorkspaceInputError("BEFORE insertion cannot split a join")
    }
    if (anchorIncoming[0]) anchorIncoming[0].toEventId = event.id
    addLink(graph, envelope, "before-link", {
      fromEventId: event.id,
      toEventId: anchor.id,
      kind: "MAIN",
      rank: anchorIncoming[0]?.rank ?? 1024,
    })
    return
  }

  const anchorOutgoing = scopedLinks.filter(
    (link) => link.fromEventId === anchor.id
  )
  if (anchorOutgoing.length > 1) {
    throw new WorkspaceInputError("AFTER insertion cannot split a fork")
  }
  if (anchorOutgoing[0]) anchorOutgoing[0].fromEventId = event.id
  addLink(graph, envelope, "after-link", {
    fromEventId: anchor.id,
    toEventId: event.id,
    kind: "MAIN",
    rank: anchorOutgoing[0]?.rank ?? 1024,
  })
}

function applyUpdatePatch(
  event: TargetJourneyEvent,
  patch: Record<string, unknown>,
  now: string
) {
  if (patch.type !== event.type) {
    throw new WorkspaceInputError("Event type is immutable; use replacement")
  }
  for (const [key, value] of Object.entries(patch)) {
    if (key === "type") continue
    if (key === "detail" && value && typeof value === "object") {
      for (const [detailKey, detailValue] of Object.entries(value)) {
        if (detailValue === null) {
          delete (event.detail as Record<string, unknown>)[detailKey]
        } else {
          ;(event.detail as Record<string, unknown>)[detailKey] = detailValue
        }
      }
    } else if (value === null) {
      delete (event as unknown as Record<string, unknown>)[key]
    } else {
      ;(event as unknown as Record<string, unknown>)[key] = value
    }
  }
  event.updatedAt = now
}

function diffEventIds(
  before: TargetJourneyGraphSnapshot,
  after: TargetJourneyGraphSnapshot
) {
  const beforeById = new Map(before.events.map((event) => [event.id, event]))
  const afterById = new Map(after.events.map((event) => [event.id, event]))
  return [...new Set([...beforeById.keys(), ...afterById.keys()])]
    .filter(
      (eventId) =>
        json(beforeById.get(eventId)) !== json(afterById.get(eventId))
    )
    .sort()
}

function invalidationScopes(
  before: TargetJourneyGraphSnapshot,
  after: TargetJourneyGraphSnapshot,
  changedEventIds: readonly string[]
) {
  const values = new Set<string | null>()
  for (const eventId of changedEventIds) {
    const previous = before.events.find((event) => event.id === eventId)
    const current = after.events.find((event) => event.id === eventId)
    if (previous) values.add(previous.parentSectionEventId)
    if (current) values.add(current.parentSectionEventId)
  }
  return [...values].sort((left, right) => {
    if (left === right) return 0
    if (left === null) return -1
    if (right === null) return 1
    return left < right ? -1 : left > right ? 1 : 0
  })
}

function storedPatch(revision: TargetWorkspaceRevision) {
  const patch = revision.patch as Partial<StoredCommandPatch>
  const entry = patch[0]
  if (
    !entry ||
    entry.op !== "command" ||
    !entry.commandEnvelope ||
    !Array.isArray(entry.changedEventIds) ||
    !Array.isArray(entry.projectionInvalidationScopes)
  ) {
    throw new WorkspaceInputError(
      `Workspace revision ${revision.revision} has no typed command metadata`
    )
  }
  return patch as StoredCommandPatch
}

function commandResult(
  revision: TargetWorkspaceRevision,
  replayedFromIdempotencyKey: boolean
): TargetCommandResult {
  const patch = storedPatch(revision)
  return targetCommandResultSchema.parse({
    aggregateId: revision.workspaceId,
    commandName: revision.commandName,
    newRevision: revision.revision,
    changedEventIds: patch[0].changedEventIds,
    patch: revision.patch,
    inversePatch: revision.inversePatch,
    projectionInvalidationScopes: patch[0].projectionInvalidationScopes,
    replayedFromIdempotencyKey,
  })
}

async function undoGraph(
  context: AuthContext,
  document: TargetWorkspaceDocument,
  envelope: TargetCommandEnvelope,
  steps: number,
  now: string
) {
  if (steps > envelope.expectedRevision) {
    throw new WorkspaceInputError(
      `Cannot undo ${steps} steps from Workspace revision ${envelope.expectedRevision}`
    )
  }
  const target = await getWorkspaceRevision(
    context,
    envelope.aggregateId,
    envelope.expectedRevision - steps + 1
  )
  if (!target) {
    throw new WorkspaceRevisionConflictError("Undo target revision is missing")
  }
  const current = document.session.headGraph
  const restored = clone(target.before)
  restored.revision = current.revision + 1

  const forkEventIds = new Set(
    [...current.branchSelections, ...target.before.branchSelections].map(
      (selection) => selection.forkEventId
    )
  )
  restored.branchSelections = clone(current.branchSelections)
  for (const forkEventId of forkEventIds) {
    const currentChoice = currentSelection(current, forkEventId)
    const desiredChoice = currentSelection(target.before, forkEventId)
    const desiredLinkId =
      desiredChoice?.selectedLinkId ??
      activeLinks(target.before).find(
        (link) => link.fromEventId === forkEventId && link.kind === "MAIN"
      )?.id
    const currentLinkId =
      currentChoice?.selectedLinkId ??
      activeLinks(current).find(
        (link) => link.fromEventId === forkEventId && link.kind === "MAIN"
      )?.id
    if (!desiredLinkId || desiredLinkId === currentLinkId) continue
    restored.branchSelections.push({
      id: deterministicId(envelope, `undo-branch-${forkEventId}`),
      journeyId: restored.id,
      forkEventId,
      selectedLinkId: desiredLinkId,
      journeyRevision: restored.revision,
      supersedesId: currentChoice?.id,
      actor: envelope.actor,
      reason: `undo ${steps} Workspace command(s)`,
      createdAt: timestampAfter(now, currentChoice?.createdAt),
    })
  }
  return validateJourneyGraph(restored)
}

function locationEndpoint(graph: TargetJourneyGraphSnapshot, eventId: string) {
  const event = requireEvent(graph, eventId)
  if (
    event.type === "SECTION" ||
    event.type === "TRANSIT" ||
    event.type === "NOTE"
  ) {
    throw new WorkspaceInputError(`Transit endpoint ${eventId} has no location`)
  }
  return {
    name: event.title,
    lat: event.detail.plannedLat,
    lng: event.detail.plannedLng,
    coordinateSystem: event.detail.coordinateSystem,
    providerPlaceId:
      event.detail.coordinateProvider?.toLowerCase() === "amap"
        ? event.detail.providerPlaceId
        : undefined,
  }
}

function targetTransitRequest(
  graph: TargetJourneyGraphSnapshot,
  eventId: string
): TransitPlanRequest {
  const event = requireEvent(graph, eventId)
  if (event.type !== "TRANSIT") {
    throw new WorkspaceInputError("Transit planning requires a TRANSIT Event")
  }
  if (!event.detail.plannedFromEventId || !event.detail.plannedToEventId) {
    throw new WorkspaceInputError("Transit endpoints are incomplete")
  }
  const mode =
    event.detail.requestMode ??
    requestModeForTransport(event.detail.transportMode)
  if (!mode) throw new WorkspaceInputError("Transit request mode is missing")
  return {
    transitEventId: event.id,
    origin: locationEndpoint(graph, event.detail.plannedFromEventId),
    destination: locationEndpoint(graph, event.detail.plannedToEventId),
    mode,
    transportMode: event.detail.transportMode,
    departAt: event.detail.plannedDepartAt,
    preference: event.detail.preference ?? "RECOMMENDED",
    alternatives: 3,
  }
}

function targetPlanningRun(
  envelope: TargetCommandEnvelope,
  bundle: TransitPlanBundle,
  requestFingerprint: string,
  calculatedAt: string
): TargetTransitPlanningRun {
  const runId = deterministicId(envelope, "transit-run")
  return {
    id: runId,
    transitEventId: bundle.transitEventId,
    requestFingerprint,
    provider: bundle.plans[0]?.provider ?? "amap",
    status: "READY",
    warning: bundle.warning,
    calculatedAt,
    plans: bundle.plans.map((plan, planIndex) => ({
      id: `${runId}-plan-${planIndex}`,
      planningRunId: runId,
      transitEventId: bundle.transitEventId,
      provider: plan.provider,
      rank: plan.rank,
      label: plan.label,
      strategy: plan.strategy,
      distanceMeters: plan.distanceMeters,
      durationSeconds: plan.durationSeconds,
      fareAmount: plan.fareAmount,
      trafficBasis: plan.trafficBasis,
      calculatedAt: plan.calculatedAt,
      validUntil: plan.validUntil,
      segments: plan.segments.map((segment, segmentIndex) => ({
        id: `${runId}-plan-${planIndex}-segment-${segmentIndex}`,
        order: segment.order,
        mode: segment.mode,
        fromName: segment.fromName,
        toName: segment.toName,
        lineName: segment.lineName,
        distanceMeters: segment.distanceMeters,
        durationSeconds: segment.durationSeconds,
        fareAmount: segment.fareAmount,
        departAt: segment.departAt,
        arriveAt: segment.arriveAt,
        coordinateSystem: segment.coordinateSystem,
        geometryKind: segment.geometryKind,
        positions: segment.positions,
        trafficSections: segment.trafficSections,
      })),
    })),
  }
}

function transitFailure(error: unknown) {
  const value = error as { code?: unknown; message?: unknown }
  return {
    code: typeof value?.code === "string" ? value.code : "MALFORMED_RESPONSE",
    message:
      typeof value?.message === "string" ? value.message : "路线规划失败",
  }
}

async function planTransit(
  context: AuthContext,
  document: TargetWorkspaceDocument,
  envelope: TargetCommandEnvelope,
  planning: WorkspaceCommandDependencies["transitPlanning"],
  now: string
) {
  if (envelope.command.name !== "journey.plan_transit") {
    throw new WorkspaceCommandUnsupportedError(envelope.command.name)
  }
  if (!planning) {
    throw new WorkspaceInputError("Transit planning is not configured")
  }
  const graph = prepareCandidateGraph(document)
  const event = requireEvent(graph, envelope.command.payload.eventId)
  if (event.type !== "TRANSIT") {
    throw new WorkspaceInputError("Transit planning requires a TRANSIT Event")
  }
  const request = targetTransitRequest(graph, event.id)
  const requestFingerprint = transitPlanFingerprint(request)
  let run: TargetTransitPlanningRun
  try {
    const bundle = await planning.plan(request, {
      userId: context.userId,
      workspaceId: envelope.aggregateId,
      agentRunId:
        envelope.actor.kind === "AGENT" ? envelope.actor.agentRunId : undefined,
      requestId: envelope.idempotencyKey,
    })
    if (
      bundle.transitEventId !== event.id ||
      bundle.requestFingerprint !== requestFingerprint
    ) {
      throw new WorkspaceInputError(
        "Transit provider returned a stale or mismatched response"
      )
    }
    run = targetPlanningRun(envelope, bundle, requestFingerprint, now)
    event.detail.activePlanningRunId = run.id
    event.detail.selectedPlanId = run.plans[0]?.id
    event.detail.routeState = "READY"
  } catch (error) {
    if (error instanceof WorkspaceInputError) throw error
    const failure = transitFailure(error)
    run = {
      id: deterministicId(envelope, "transit-run"),
      transitEventId: event.id,
      requestFingerprint,
      provider: "amap",
      status: "FAILED",
      errorCode: failure.code,
      errorMessage: failure.message,
      calculatedAt: now,
      plans: [],
    }
    if (event.detail.activePlanningRunId && event.detail.selectedPlanId) {
      event.detail.routeState = "ROUTE_STALE"
    }
  }
  graph.transitPlanningRuns.push(run)
  event.updatedAt = now
  return validateJourneyGraph(graph)
}

async function applyContentCommand(
  context: AuthContext,
  document: TargetWorkspaceDocument,
  envelope: TargetCommandEnvelope,
  now: string
) {
  const graph = prepareCandidateGraph(document)
  const command = envelope.command
  if (command.name === "journey.attach_asset") {
    requireEvent(graph, command.payload.eventId)
    const asset = await getAsset(context, command.payload.assetId)
    if (!asset || asset.deletedAt) {
      throw new WorkspaceInputError("Active Asset was not found")
    }
    if (asset.ownerId !== graph.ownerId && asset.visibility !== "PUBLIC") {
      throw new PermissionDeniedError("Asset cannot be linked to this Journey")
    }
    const visibilityRank = { PRIVATE: 0, JOURNEY: 1, PUBLIC: 2 } as const
    if (
      visibilityRank[command.payload.visibility] >
      visibilityRank[asset.visibility]
    ) {
      throw new WorkspaceInputError(
        "Event link cannot broaden Asset visibility"
      )
    }
    const rank =
      Math.max(
        -1,
        ...graph.eventAssetLinks
          .filter(
            (link) =>
              link.eventId === command.payload.eventId &&
              link.role === command.payload.role &&
              activeAtRevision(link, graph.revision)
          )
          .map((link) => link.rank)
      ) + 1
    graph.eventAssetLinks.push({
      id: deterministicId(envelope, "event-asset-link"),
      journeyId: graph.id,
      eventId: command.payload.eventId,
      assetId: asset.id,
      assetChecksum: asset.checksum,
      role: command.payload.role,
      rank,
      caption: command.payload.caption,
      visibility: command.payload.visibility,
      introducedRevision: graph.revision,
      createdAt: now,
    })
    return validateJourneyGraph(graph)
  }
  if (command.name === "journey.add_observation") {
    requireEvent(graph, command.payload.eventId)
    const superseded = command.payload.observation.supersedesId
      ? graph.observations.find(
          (observation) =>
            observation.id === command.payload.observation.supersedesId
        )
      : undefined
    graph.observations.push({
      ...command.payload.observation,
      id: deterministicId(envelope, "event-observation"),
      eventId: command.payload.eventId,
      observedAt: command.payload.observation.observedAt ?? now,
      actor: envelope.actor,
      createdAt: timestampAfter(now, superseded?.createdAt),
    } as TargetJourneyGraphSnapshot["observations"][number])
    return validateJourneyGraph(graph)
  }
  if (command.name === "journey.link_source_item") {
    requireEvent(graph, command.payload.eventId)
    const item = await prisma.sourceItem.findUnique({
      where: { id: command.payload.sourceItemId },
      include: { sourceDocument: { include: { sourcePack: true } } },
    })
    if (!item) throw new WorkspaceInputError("SourceItem was not found")
    const pack = item.sourceDocument.sourcePack
    if (
      pack.ownerId !== graph.ownerId &&
      !(
        pack.visibility === "SHARED" &&
        command.payload.approvedForJourneySharing &&
        command.payload.excerpt?.trim()
      )
    ) {
      throw new PermissionDeniedError(
        "External SourceItem requires sharing approval and an excerpt"
      )
    }
    const rank =
      Math.max(
        -1,
        ...graph.eventSourceLinks
          .filter(
            (link) =>
              link.eventId === command.payload.eventId &&
              link.role === command.payload.role &&
              activeAtRevision(link, graph.revision)
          )
          .map((link) => link.rank)
      ) + 1
    graph.eventSourceLinks.push({
      id: deterministicId(envelope, "event-source-link"),
      journeyId: graph.id,
      eventId: command.payload.eventId,
      sourceItemId: item.id,
      sourceDocumentId: item.sourceDocument.id,
      sourceDocumentChecksum: item.sourceDocument.checksum,
      role: command.payload.role,
      excerpt: command.payload.excerpt?.trim() || undefined,
      page: command.payload.page?.trim() || undefined,
      confidence: item.confidence,
      rank,
      approvedForJourneySharing: command.payload.approvedForJourneySharing,
      introducedRevision: graph.revision,
      createdAt: now,
    })
    return validateJourneyGraph(graph)
  }
  throw new WorkspaceCommandUnsupportedError(command.name)
}

function commandEventIds(
  graph: TargetJourneyGraphSnapshot,
  command: TargetCommandEnvelope["command"]
) {
  if ("eventId" in command.payload) return [command.payload.eventId]
  if (command.name === "journey.replace_event") {
    return [command.payload.predecessorEventId]
  }
  if (command.name === "journey.add_link") {
    return [command.payload.link.fromEventId, command.payload.link.toEventId]
  }
  if (command.name === "journey.retire_link") {
    const link = graph.links.find(
      (candidate) => candidate.id === command.payload.linkId
    )
    return link ? [link.fromEventId, link.toEventId] : []
  }
  if (command.name === "journey.select_branch") {
    return [command.payload.forkEventId]
  }
  return []
}

function applyJourneyCommand(
  document: TargetWorkspaceDocument,
  envelope: TargetCommandEnvelope,
  now: string
) {
  if (!envelope.command.name.startsWith("journey.")) {
    throw new WorkspaceCommandUnsupportedError(envelope.command.name)
  }
  const command = envelope.command as JourneyCommand
  const graph = prepareCandidateGraph(document)

  switch (command.name) {
    case "journey.add_event": {
      const unscheduled = command.payload.position.placement === "UNSCHEDULED"
      const parentSectionEventId = unscheduled
        ? null
        : insertionParent(graph, command.payload.position as never)
      const event = buildEvent(
        graph,
        command.payload.event,
        envelope,
        now,
        parentSectionEventId,
        unscheduled ? "UNSCHEDULED" : "SCHEDULED"
      )
      if (graph.events.some((candidate) => candidate.id === event.id)) {
        throw new WorkspaceInputError(`Event ${event.id} already exists`)
      }
      graph.events.push(event)
      positionEvent(graph, event, command.payload.position, envelope)
      break
    }
    case "journey.update_event": {
      const event = requireEvent(graph, command.payload.eventId)
      applyUpdatePatch(
        event,
        command.payload.patch as Record<string, unknown>,
        now
      )
      break
    }
    case "journey.move_event":
    case "journey.place_event": {
      const event = requireEvent(graph, command.payload.eventId)
      positionEvent(graph, event, command.payload.position, envelope)
      event.updatedAt = now
      break
    }
    case "journey.retire_event": {
      const event = requireEvent(graph, command.payload.eventId)
      const targets = new Set([event.id])
      if (event.type === "SECTION") {
        const children = activeEvents(graph).filter(
          (candidate) => candidate.parentSectionEventId === event.id
        )
        if (children.length && command.payload.sectionChildren === undefined) {
          throw new WorkspaceInputError(
            "Retiring a non-empty SECTION requires an explicit child policy"
          )
        }
        if (command.payload.sectionChildren === "RECURSIVE_RETIRE") {
          let added = true
          while (added) {
            added = false
            for (const child of activeEvents(graph)) {
              if (
                child.parentSectionEventId &&
                targets.has(child.parentSectionEventId) &&
                !targets.has(child.id)
              ) {
                targets.add(child.id)
                added = true
              }
            }
          }
        }
        if (command.payload.sectionChildren === "MOVE_CHILDREN") {
          for (const child of children) {
            child.parentSectionEventId =
              command.payload.destinationSectionEventId ?? null
            child.updatedAt = now
          }
        }
      }
      for (const targetId of targets) {
        const target = requireEvent(graph, targetId)
        const incoming = activeLinks(graph).filter(
          (link) =>
            link.toEventId === targetId && !targets.has(link.fromEventId)
        )
        const outgoing = activeLinks(graph).filter(
          (link) =>
            link.fromEventId === targetId && !targets.has(link.toEventId)
        )
        if (incoming.length === 1 && outgoing.length === 1) {
          incoming[0]!.toEventId = outgoing[0]!.toEventId
          outgoing[0]!.retiredRevision = graph.revision
        } else {
          for (const link of [...incoming, ...outgoing]) {
            link.retiredRevision = graph.revision
          }
        }
        target.retiredRevision = graph.revision
        target.updatedAt = now
      }
      break
    }
    case "journey.replace_event": {
      const predecessor = requireEvent(
        graph,
        command.payload.predecessorEventId
      )
      const successor = buildEvent(
        graph,
        command.payload.successor,
        envelope,
        now,
        predecessor.parentSectionEventId,
        predecessor.placementStatus
      )
      if (graph.events.some((candidate) => candidate.id === successor.id)) {
        throw new WorkspaceInputError(`Event ${successor.id} already exists`)
      }
      predecessor.retiredRevision = graph.revision
      predecessor.updatedAt = now
      graph.events.push(successor)
      for (const link of activeLinks(graph)) {
        if (link.fromEventId === predecessor.id) link.fromEventId = successor.id
        if (link.toEventId === predecessor.id) link.toEventId = successor.id
      }
      graph.replacements.push({
        id: deterministicId(envelope, "replacement"),
        journeyId: graph.id,
        predecessorEventId: predecessor.id,
        successorEventId: successor.id,
        revision: graph.revision,
        reason: command.payload.reason,
      })
      break
    }
    case "journey.add_link": {
      requireEvent(graph, command.payload.link.fromEventId)
      requireEvent(graph, command.payload.link.toEventId)
      const id =
        command.payload.link.id ?? deterministicId(envelope, "explicit-link")
      if (graph.links.some((candidate) => candidate.id === id)) {
        throw new WorkspaceInputError(`Link ${id} already exists`)
      }
      graph.links.push({
        ...command.payload.link,
        id,
        journeyId: graph.id,
        introducedRevision: graph.revision,
      })
      break
    }
    case "journey.retire_link": {
      requireLink(graph, command.payload.linkId).retiredRevision =
        graph.revision
      break
    }
    case "journey.select_branch": {
      const fork = requireEvent(graph, command.payload.forkEventId)
      const link = requireLink(graph, command.payload.selectedLinkId)
      if (link.fromEventId !== fork.id) {
        throw new WorkspaceInputError(
          "Branch selection must use an outgoing Link"
        )
      }
      const previous = currentSelection(graph, fork.id)
      graph.branchSelections.push({
        id: deterministicId(envelope, "branch-selection"),
        journeyId: graph.id,
        forkEventId: fork.id,
        selectedLinkId: link.id,
        journeyRevision: graph.revision,
        supersedesId: previous?.id,
        actor: envelope.actor,
        reason: command.payload.reason,
        createdAt: timestampAfter(now, previous?.createdAt),
      })
      break
    }
    case "journey.select_transit_plan": {
      const event = requireEvent(graph, command.payload.eventId)
      if (event.type !== "TRANSIT") {
        throw new WorkspaceInputError("Transit plan selection requires TRANSIT")
      }
      const run = graph.transitPlanningRuns.find(
        (candidate) => candidate.id === event.detail.activePlanningRunId
      )
      if (
        !run ||
        run.status !== "READY" ||
        !run.plans.some((plan) => plan.id === command.payload.planId)
      ) {
        throw new WorkspaceInputError("Selected TransitPlan is not active")
      }
      event.detail.selectedPlanId = command.payload.planId
      event.updatedAt = now
      break
    }
    case "journey.confirm_actual": {
      const event = requireEvent(graph, command.payload.eventId)
      if (
        event.type === "SECTION" ||
        event.type === "NOTE" ||
        event.type !== command.payload.actual.type
      ) {
        throw new WorkspaceInputError(
          "Actual facts must match an executable Event"
        )
      }
      event.executionStatus = "CONFIRMED"
      event.actualStartAt = command.payload.actual.actualStartAt
      event.actualEndAt = command.payload.actual.actualEndAt
      Object.assign(event.detail, command.payload.actual.detail)
      event.updatedAt = now
      break
    }
    case "journey.skip_event":
    case "journey.cancel_event": {
      const event = requireEvent(graph, command.payload.eventId)
      if (event.type === "SECTION" || event.type === "NOTE") {
        throw new WorkspaceInputError(
          "Only executable Events have execution status"
        )
      }
      event.executionStatus =
        command.name === "journey.skip_event" ? "SKIPPED" : "CANCELLED"
      event.updatedAt = now
      break
    }
    case "journey.plan_transit":
    case "journey.attach_asset":
    case "journey.add_observation":
    case "journey.link_source_item":
    case "journey.undo":
      throw new WorkspaceCommandUnsupportedError(command.name)
  }
  return validateJourneyGraph(graph)
}

export class WorkspaceCommandService {
  private readonly transitPlanning: WorkspaceCommandDependencies["transitPlanning"]

  constructor(dependencies: WorkspaceCommandDependencies = {}) {
    this.transitPlanning =
      dependencies.transitPlanning ?? transitPlanningService
  }

  async execute(
    context: AuthContext,
    input: TargetCommandEnvelope,
    options: ExecuteOptions = {}
  ): Promise<TargetCommandResult> {
    const envelope = targetCommandEnvelopeSchema.parse(input)
    if (envelope.aggregateId !== input.aggregateId) {
      throw new WorkspaceInputError(
        "Command aggregate id changed during parsing"
      )
    }

    const existing = await getWorkspaceRevisionByIdempotencyKey(
      context,
      envelope.aggregateId,
      envelope.idempotencyKey
    )
    if (existing) {
      const patch = storedPatch(existing)
      if (json(patch[0].commandEnvelope) !== json(envelope)) {
        throw new WorkspaceIdempotencyConflictError()
      }
      return commandResult(existing, true)
    }

    const document = await getWorkspaceDocument(
      context,
      envelope.aggregateId,
      options.now
    )
    if (!document) throw new WorkspaceInputError("Workspace was not found")
    if (document.session.headWorkspaceRevision !== envelope.expectedRevision) {
      throw new WorkspaceRevisionConflictError()
    }
    if (document.session.status !== "ACTIVE") {
      throw new WorkspaceInputError("Workspace is not active")
    }
    if (
      envelope.actor.kind === "USER" &&
      envelope.actor.userId !== context.userId
    ) {
      throw new WorkspaceInputError(
        "Workspace USER actor must be authenticated"
      )
    }
    if (envelope.actor.kind === "SYSTEM") {
      throw new WorkspaceInputError(
        "SYSTEM Workspace writes require a trusted internal writer"
      )
    }
    if (envelope.actor.kind === "AGENT") {
      const agentRunId = envelope.actor.agentRunId
      if (
        !document.agentRuns.some(
          (run) => run.id === agentRunId && run.status === "RUNNING"
        )
      ) {
        throw new WorkspaceInputError(
          "Workspace AGENT actor requires a running same-Workspace Agent run"
        )
      }
    }

    const before = document.session.headGraph
    const now = (options.now ?? new Date()).toISOString()
    const after =
      envelope.command.name === "journey.undo"
        ? await undoGraph(
            context,
            document,
            envelope,
            envelope.command.payload.steps,
            now
          )
        : envelope.command.name === "journey.plan_transit"
          ? await planTransit(
              context,
              document,
              envelope,
              this.transitPlanning,
              now
            )
          : envelope.command.name === "journey.attach_asset" ||
              envelope.command.name === "journey.add_observation" ||
              envelope.command.name === "journey.link_source_item"
            ? await applyContentCommand(context, document, envelope, now)
            : applyJourneyCommand(document, envelope, now)
    const changedEventIds = [
      ...new Set([
        ...diffEventIds(before, after),
        ...commandEventIds(before, envelope.command),
        ...(envelope.command.name === "journey.undo"
          ? activeEvents(before).map((event) => event.id)
          : []),
      ]),
    ].sort()
    const projectionInvalidationScopes = invalidationScopes(
      before,
      after,
      changedEventIds
    )
    const patch: StoredCommandPatch = [
      {
        op: "command",
        commandEnvelope: envelope,
        changedEventIds,
        projectionInvalidationScopes,
      },
    ]
    const inversePatch = [
      {
        op: "restore",
        restoreWorkspaceRevision: envelope.expectedRevision,
        graph: before,
      },
    ]
    const revision = await appendWorkspaceRevision(
      context,
      envelope.aggregateId,
      {
        expectedRevision: envelope.expectedRevision,
        commandName: envelope.command.name,
        after,
        patch,
        inversePatch,
        idempotencyKey: envelope.idempotencyKey,
        actor: envelope.actor,
        now: options.now,
      }
    )
    if (!revision) throw new WorkspaceInputError("Workspace was not found")
    return commandResult(revision, false)
  }

  getDocument(context: AuthContext, workspaceId: string, now?: Date) {
    return getWorkspaceDocument(context, workspaceId, now)
  }
}
