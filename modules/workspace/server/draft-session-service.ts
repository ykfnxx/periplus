import { randomUUID } from "node:crypto"
import type { AuthContext } from "@/modules/auth/server/context"
import {
  descendantsOf,
  findMainIncomingLink,
  findMainOutgoingLink,
  projectMainSequence,
} from "@/lib/journeys/graph"
import { isLocationEvent } from "@/lib/journeys/locations"
import {
  applyTransitPlanBundle,
  buildTransitPlanRequest,
  mergeWorkspaceTransitPlans,
  selectedTransitPlan,
  transitPlanFingerprint,
  type TransitPlanBundle,
  type TransitPlanRequest,
} from "@/lib/journeys/planning"
import { validateJourneyInput } from "@/lib/journeys/validation"
import type {
  DraftJourney,
  Journey,
  JourneyEvent,
  JourneyEventCreateInput,
  JourneyEventLink,
  JourneyEventPosition,
  JourneyInput,
  TransitEvent,
} from "@/types/journey"
import type {
  AgentConversationMessage,
  DraftSnapshot,
  JourneyAddEventInput,
  JourneyLinkPlaceInput,
  JourneyMoveEventInput,
  JourneyRemoveEventInput,
  JourneyReplaceEventInput,
  JourneyToolName,
  JourneyUpdateEventInput,
  PlanTransitInput,
  SelectTransitPlanInput,
  SessionDraft,
  ToolCallSuggestionCall,
  ToolCallSuggestionCreateInput,
  UndoJourneyInput,
} from "./contracts"

export class DraftInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DraftInputError"
  }
}

interface TransitPlanningPort {
  plan(request: TransitPlanRequest): Promise<TransitPlanBundle>
}

function nowIso() {
  return new Date().toISOString()
}

function draftId(prefix: string) {
  return `draft-${prefix}-${randomUUID()}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function pendingSuggestionSummaries(session: SessionDraft) {
  return session.pendingSuggestions.map((suggestion) => ({
    id: suggestion.id,
    title: suggestion.title,
    summary: suggestion.summary,
    toolCallCount: suggestion.toolCalls.length,
    draftRevision: suggestion.draftRevision,
    createdAt: suggestion.createdAt,
    updatedAt: suggestion.updatedAt,
  }))
}

function isPersistedJourney(input: JourneyInput | Journey): input is Journey {
  return (
    typeof (input as Journey).createdAt === "string" &&
    typeof (input as Journey).updatedAt === "string" &&
    typeof (input as Journey).revision === "number"
  )
}

function validatedJourney(input: unknown): JourneyInput {
  const result = validateJourneyInput(input)
  if (!result.ok) throw new DraftInputError(result.error)
  return result.data
}

function toJourneyInput(journey: DraftJourney): JourneyInput {
  return {
    id: journey.id,
    title: journey.title,
    description: journey.description,
    status: journey.status,
    events: clone(journey.events),
    links: clone(journey.links),
  }
}

function toDraftJourney(input: JourneyInput | Journey): DraftJourney {
  const data = validatedJourney(input)
  const persisted = isPersistedJourney(input) ? input : null
  const journeyId = data.id ?? persisted?.id ?? draftId("journey")
  return {
    id: journeyId,
    title: data.title,
    description: data.description,
    status: data.status,
    events: data.events.map((event) => ({ ...clone(event), journeyId })),
    links: data.links.map((link) => ({ ...clone(link), journeyId })),
  }
}

function createEvent(
  journeyId: string,
  input: JourneyEventCreateInput,
  parentEventId?: string
): JourneyEvent {
  return {
    ...clone(input),
    id: input.id ?? draftId("event"),
    journeyId,
    parentEventId,
  } as JourneyEvent
}

function mainLink(fromEventId: string, toEventId: string): JourneyEventLink {
  return {
    id: draftId("link"),
    fromEventId,
    toEventId,
    kind: "MAIN",
  }
}

function alternativeLink(
  fromEventId: string,
  toEventId: string,
  branchKey?: string
): JourneyEventLink {
  return {
    id: draftId("link"),
    fromEventId,
    toEventId,
    kind: "ALTERNATIVE",
    branchKey,
  }
}

function positionScope(journey: DraftJourney, position: JourneyEventPosition) {
  if (position.placement === "start" || position.placement === "end") {
    if (
      position.parentEventId &&
      !journey.events.some((event) => event.id === position.parentEventId)
    ) {
      throw new DraftInputError("Parent event not found")
    }
    return position.parentEventId
  }
  if (position.placement === "branch") {
    const from = journey.events.find(
      (event) => event.id === position.fromEventId
    )
    if (!from || from.replacedByEventId) {
      throw new DraftInputError("Branch start event not found")
    }
    const to = position.toEventId
      ? journey.events.find((event) => event.id === position.toEventId)
      : undefined
    if (position.toEventId && (!to || to.replacedByEventId)) {
      throw new DraftInputError("Branch end event not found")
    }
    if (to && to.parentEventId !== from.parentEventId) {
      throw new DraftInputError("Branch endpoints must share parentEventId")
    }
    return from.parentEventId
  }
  const target = journey.events.find((event) => event.id === position.eventId)
  if (!target) throw new DraftInputError("Position event not found")
  return target.parentEventId
}

function insertIntoMainChain(
  journey: DraftJourney,
  event: JourneyEvent,
  position: JourneyEventPosition
) {
  if (journey.events.some((candidate) => candidate.id === event.id)) {
    throw new DraftInputError(`Event ${event.id} already exists`)
  }
  if (position.placement === "branch") {
    journey.events.push(event)
    journey.links.push(
      alternativeLink(position.fromEventId, event.id, position.branchKey)
    )
    if (position.toEventId) {
      journey.links.push(
        alternativeLink(event.id, position.toEventId, position.branchKey)
      )
    }
    return
  }

  const sequence = projectMainSequence(journey, event.parentEventId)

  let previous: JourneyEvent | undefined
  let next: JourneyEvent | undefined
  if (position.placement === "start") {
    next = sequence[0]
  } else if (position.placement === "end") {
    previous = sequence.at(-1)
  } else {
    const targetIndex = sequence.findIndex(
      (candidate) => candidate.id === position.eventId
    )
    if (targetIndex === -1) {
      throw new DraftInputError("Position event is not on the MAIN path")
    }
    if (position.placement === "before") {
      previous = sequence[targetIndex - 1]
      next = sequence[targetIndex]
    } else {
      previous = sequence[targetIndex]
      next = sequence[targetIndex + 1]
    }
  }

  if (previous && next) {
    journey.links = journey.links.filter(
      (link) =>
        !(
          link.kind === "MAIN" &&
          link.fromEventId === previous.id &&
          link.toEventId === next.id
        )
    )
  }
  journey.events.push(event)
  if (previous) journey.links.push(mainLink(previous.id, event.id))
  if (next) journey.links.push(mainLink(event.id, next.id))
}

function detachFromMainChain(journey: DraftJourney, eventId: string) {
  const incoming = findMainIncomingLink(journey.links, eventId)
  const outgoing = findMainOutgoingLink(journey.links, eventId)
  journey.links = journey.links.filter(
    (link) => link.fromEventId !== eventId && link.toEventId !== eventId
  )
  if (incoming && outgoing) {
    journey.links.push(mainLink(incoming.fromEventId, outgoing.toEventId))
  }
}

export class DraftSessionService {
  private readonly sessions = new Map<string, SessionDraft>()

  constructor(
    private readonly transitPlanning: TransitPlanningPort | null = null
  ) {}

  getSnapshot(sessionId: string): DraftSnapshot {
    const session = this.ensureSession(sessionId)
    return {
      sessionId,
      document: session.document ? clone(session.document) : null,
      sourceJourneyId: session.sourceJourneyId,
      baseRevision: session.baseRevision,
      dirty: session.dirty,
      isLocked: Boolean(session.lockedByRunId),
      lockedByRunId: session.lockedByRunId,
      revision: session.revision,
      pendingSuggestions: pendingSuggestionSummaries(session),
      updatedAt: session.updatedAt,
    }
  }

  bindSessionContext(sessionId: string, context: AuthContext) {
    const session = this.ensureSession(sessionId)
    session.userContext = context
    session.updatedAt = nowIso()
    return this.getSnapshot(sessionId)
  }

  getSessionContext(sessionId: string) {
    return this.ensureSession(sessionId).userContext
  }

  getConversationMessages(sessionId: string) {
    return this.ensureSession(sessionId).conversationMessages.map(
      (message) => ({
        ...message,
      })
    )
  }

  addUserConversationMessage(sessionId: string, content: string) {
    return this.addConversationMessage(sessionId, {
      role: "user",
      content,
      runId: null,
    })
  }

  appendAssistantConversationDelta(
    sessionId: string,
    runId: string,
    content: string
  ) {
    const session = this.ensureSession(sessionId)
    const lastMessage = session.conversationMessages.at(-1)
    const timestamp = nowIso()
    if (lastMessage?.role === "assistant" && lastMessage.runId === runId) {
      lastMessage.content += content
      lastMessage.updatedAt = timestamp
      session.updatedAt = timestamp
      return { ...lastMessage }
    }
    return this.addConversationMessage(sessionId, {
      role: "assistant",
      content,
      runId,
    })
  }

  isLocked(sessionId: string) {
    return Boolean(this.ensureSession(sessionId).lockedByRunId)
  }

  lock(sessionId: string, runId: string) {
    const session = this.ensureSession(sessionId)
    session.lockedByRunId = runId
    session.updatedAt = nowIso()
    return this.getSnapshot(sessionId)
  }

  unlock(sessionId: string, runId: string) {
    const session = this.ensureSession(sessionId)
    if (session.lockedByRunId === runId) {
      session.lockedByRunId = null
      session.updatedAt = nowIso()
    }
    return this.getSnapshot(sessionId)
  }

  loadPersistedJourney(sessionId: string, journey: Journey) {
    const session = this.ensureSession(sessionId)
    session.document = toDraftJourney(journey)
    session.sourceJourneyId = journey.id
    session.baseRevision = journey.revision
    session.revisions = []
    this.touchSession(session, false)
    session.dirty = false
    return this.getSnapshot(sessionId)
  }

  replaceDraft(sessionId: string, journey: JourneyInput | Journey | null) {
    const session = this.ensureSession(sessionId)
    const before = session.document ? clone(session.document) : null
    session.document = journey ? toDraftJourney(journey) : null
    const sourceJourneyId =
      journey &&
      isPersistedJourney(journey) &&
      !journey.id.startsWith("draft-") &&
      !journey.id.startsWith("preset-")
        ? journey.id
        : null
    session.sourceJourneyId = sourceJourneyId
    session.baseRevision =
      sourceJourneyId && journey && isPersistedJourney(journey)
        ? journey.revision
        : null
    this.recordRevision(session, "draft.replace", undefined, before)
    session.dirty = Boolean(journey) && !sourceJourneyId
    return this.getSnapshot(sessionId)
  }

  getDraftForSave(sessionId: string) {
    const session = this.ensureJourneySession(sessionId)
    return {
      document: clone(session.document),
      journeyInput: toJourneyInput(session.document),
      sourceJourneyId: session.sourceJourneyId,
      baseRevision: session.baseRevision,
    }
  }

  markDraftSaved(
    sessionId: string,
    persistedJourney: Journey,
    preserveTransitPlans = false
  ) {
    const session = this.ensureSession(sessionId)
    const persistedDocument = toDraftJourney(persistedJourney)
    session.document =
      preserveTransitPlans && session.document
        ? mergeWorkspaceTransitPlans(session.document, persistedDocument)
        : persistedDocument
    session.sourceJourneyId = persistedJourney.id
    session.baseRevision = persistedJourney.revision
    this.touchSession(session, false)
    session.dirty = false
    return this.getSnapshot(sessionId)
  }

  createSuggestion(sessionId: string, input: ToolCallSuggestionCreateInput) {
    const session = this.ensureSession(sessionId)
    if (!input.toolCalls.length) {
      throw new DraftInputError(
        "Suggestion must contain at least one tool call"
      )
    }
    const timestamp = nowIso()
    session.pendingSuggestions = [
      {
        id: `suggestion-${randomUUID()}`,
        title: input.title.trim() || "行程修改建议",
        summary: input.summary.trim() || "Agent 生成了一组待确认的行程修改",
        toolCalls: clone<ToolCallSuggestionCall[]>(input.toolCalls),
        draftRevision: session.revision,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      ...session.pendingSuggestions,
    ].slice(0, 8)
    session.updatedAt = timestamp
    return this.getSnapshot(sessionId)
  }

  rejectSuggestion(sessionId: string, suggestionId: string) {
    const session = this.ensureSession(sessionId)
    session.pendingSuggestions = session.pendingSuggestions.filter(
      (suggestion) => suggestion.id !== suggestionId
    )
    session.updatedAt = nowIso()
    return this.getSnapshot(sessionId)
  }

  async acceptSuggestion(sessionId: string, suggestionId: string) {
    const session = this.ensureSession(sessionId)
    const suggestion = session.pendingSuggestions.find(
      (candidate) => candidate.id === suggestionId
    )
    if (!suggestion) throw new DraftInputError("Suggestion not found")
    if (suggestion.draftRevision !== session.revision) {
      throw new DraftInputError("Suggestion is stale; regenerate it first")
    }

    const previewSessionId = `suggestion-preview-${randomUUID()}`
    this.sessions.set(previewSessionId, {
      ...clone(session),
      sessionId: previewSessionId,
      pendingSuggestions: [],
      lockedByRunId: null,
    })
    try {
      for (const toolCall of suggestion.toolCalls) {
        await this.callTool(previewSessionId, toolCall.tool, toolCall.input)
      }
      const preview = this.ensureSession(previewSessionId)
      session.document = preview.document ? clone(preview.document) : null
      session.revisions = clone(preview.revisions)
      session.revision = preview.revision
      session.dirty = preview.dirty
      session.pendingSuggestions = session.pendingSuggestions.filter(
        (candidate) =>
          candidate.id !== suggestionId &&
          candidate.draftRevision === session.revision
      )
      session.updatedAt = nowIso()
      return this.getSnapshot(sessionId)
    } finally {
      this.sessions.delete(previewSessionId)
    }
  }

  journeyAddEvent(sessionId: string, input: JourneyAddEventInput) {
    const session = this.ensureJourneySession(sessionId)
    const journey = clone(session.document)
    const parentEventId = positionScope(journey, input.position)
    const event = createEvent(journey.id, input.event, parentEventId)
    insertIntoMainChain(journey, event, input.position)
    return this.commitJourney(session, journey, "journey.add_event", event.id)
  }

  journeyMoveEvent(sessionId: string, input: JourneyMoveEventInput) {
    const session = this.ensureJourneySession(sessionId)
    const journey = clone(session.document)
    const event = journey.events.find(
      (candidate) => candidate.id === input.eventId
    )
    if (!event) throw new DraftInputError("Event not found")
    if (event.replacedByEventId) {
      throw new DraftInputError("Replaced events cannot be moved")
    }
    detachFromMainChain(journey, event.id)
    journey.events = journey.events.filter(
      (candidate) => candidate.id !== event.id
    )
    event.parentEventId = positionScope(journey, input.position)
    insertIntoMainChain(journey, event, input.position)
    return this.commitJourney(session, journey, "journey.move_event", event.id)
  }

  journeyRemoveEvent(sessionId: string, input: JourneyRemoveEventInput) {
    const session = this.ensureJourneySession(sessionId)
    const journey = clone(session.document)
    const event = journey.events.find(
      (candidate) => candidate.id === input.eventId
    )
    if (!event) throw new DraftInputError("Event not found")
    const descendants = descendantsOf(journey, event.id)
    if (descendants.length && !input.cascade) {
      throw new DraftInputError(
        "Event has children; set cascade to remove them"
      )
    }

    const removedIds = new Set([
      event.id,
      ...descendants.map((item) => item.id),
    ])
    const removesReplacementLineage = journey.events.some(
      (candidate) =>
        (removedIds.has(candidate.id) &&
          Boolean(candidate.replacedByEventId)) ||
        Boolean(
          candidate.replacedByEventId &&
          removedIds.has(candidate.replacedByEventId)
        )
    )
    if (removesReplacementLineage) {
      throw new DraftInputError(
        "Replacement lineage cannot be removed; undo replacement instead"
      )
    }

    detachFromMainChain(journey, event.id)
    journey.events = journey.events.filter((item) => !removedIds.has(item.id))
    journey.links = journey.links.filter(
      (link) =>
        !removedIds.has(link.fromEventId) && !removedIds.has(link.toEventId)
    )
    for (const remaining of journey.events) {
      if (remaining.type === "TRANSIT") {
        if (
          remaining.detail.plannedFromEventId &&
          removedIds.has(remaining.detail.plannedFromEventId)
        ) {
          remaining.detail.plannedFromEventId = undefined
        }
        if (
          remaining.detail.plannedToEventId &&
          removedIds.has(remaining.detail.plannedToEventId)
        ) {
          remaining.detail.plannedToEventId = undefined
        }
        if (
          remaining.detail.actualFromEventId &&
          removedIds.has(remaining.detail.actualFromEventId)
        ) {
          remaining.detail.actualFromEventId = undefined
        }
        if (
          remaining.detail.actualToEventId &&
          removedIds.has(remaining.detail.actualToEventId)
        ) {
          remaining.detail.actualToEventId = undefined
        }
      }
    }
    return this.commitJourney(
      session,
      journey,
      "journey.remove_event",
      event.id
    )
  }

  journeyUpdateEvent(sessionId: string, input: JourneyUpdateEventInput) {
    const session = this.ensureJourneySession(sessionId)
    const journey = clone(session.document)
    const index = journey.events.findIndex(
      (event) => event.id === input.eventId
    )
    if (index === -1) throw new DraftInputError("Event not found")
    const current = journey.events[index]
    if (!current) throw new DraftInputError("Event not found")
    const next = {
      ...current,
      ...input.patch,
      description:
        input.patch.description === null
          ? undefined
          : (input.patch.description ?? current.description),
      detail: input.patch.detail
        ? { ...current.detail, ...input.patch.detail }
        : current.detail,
    } as JourneyEvent
    if (current.type === "SECTION" || current.type === "NOTE") {
      delete (next as { executionStatus?: unknown }).executionStatus
    }
    journey.events[index] = next
    return this.commitJourney(
      session,
      journey,
      "journey.update_event",
      current.id
    )
  }

  journeyReplaceEvent(sessionId: string, input: JourneyReplaceEventInput) {
    const session = this.ensureJourneySession(sessionId)
    const journey = clone(session.document)
    const old = journey.events.find((event) => event.id === input.eventId)
    if (!old) throw new DraftInputError("Event not found")
    if (old.replacedByEventId)
      throw new DraftInputError("Event is already replaced")
    const children = journey.events.filter(
      (event) => event.parentEventId === old.id
    )
    if (children.length && input.replacement.type !== "SECTION") {
      throw new DraftInputError(
        "A non-empty SECTION can only be replaced by another SECTION"
      )
    }

    const replacement = createEvent(
      journey.id,
      input.replacement,
      old.parentEventId
    )
    journey.links = journey.links.map((link) => ({
      ...link,
      fromEventId:
        link.fromEventId === old.id ? replacement.id : link.fromEventId,
      toEventId: link.toEventId === old.id ? replacement.id : link.toEventId,
    }))
    old.replacedByEventId = replacement.id
    for (const child of children) child.parentEventId = replacement.id
    for (const event of journey.events) {
      if (event.type !== "TRANSIT" || event.replacedByEventId) continue
      if (event.detail.plannedFromEventId === old.id) {
        event.detail.plannedFromEventId = replacement.id
      }
      if (event.detail.plannedToEventId === old.id) {
        event.detail.plannedToEventId = replacement.id
      }
      if (event.detail.actualFromEventId === old.id) {
        event.detail.actualFromEventId = replacement.id
      }
      if (event.detail.actualToEventId === old.id) {
        event.detail.actualToEventId = replacement.id
      }
    }
    if (old.type !== "SECTION" && old.type !== "NOTE") {
      old.executionStatus = "CANCELLED"
    }
    journey.events.push(replacement)
    return this.commitJourney(session, journey, "journey.replace_event", old.id)
  }

  journeyLinkPlace(sessionId: string, input: JourneyLinkPlaceInput) {
    const session = this.ensureJourneySession(sessionId)
    const journey = clone(session.document)
    const event = journey.events.find(
      (candidate) => candidate.id === input.eventId
    )
    if (!event || !isLocationEvent(event)) {
      throw new DraftInputError("Location event not found")
    }
    event.title = input.place.name
    if (event.type === "SECTION") {
      event.detail = {
        ...event.detail,
        placeId: input.place.placeId,
        lat: input.place.coordinate.lat,
        lng: input.place.coordinate.lng,
        coordinateSystem: input.place.coordinate.coordinateSystem,
        coordinateProvider: input.place.coordinate.provider,
        providerPlaceId: input.place.providerPlaceId,
      }
    } else {
      event.detail = {
        ...event.detail,
        plannedPlaceId: input.place.placeId,
        plannedLat: input.place.coordinate.lat,
        plannedLng: input.place.coordinate.lng,
        coordinateSystem: input.place.coordinate.coordinateSystem,
        coordinateProvider: input.place.coordinate.provider,
        providerPlaceId: input.place.providerPlaceId,
      }
    }
    return this.commitJourney(session, journey, "journey.link_place", event.id)
  }

  async journeyPlanTransit(sessionId: string, input: PlanTransitInput) {
    if (!this.transitPlanning) {
      throw new DraftInputError("Transit planning is not configured")
    }
    const session = this.ensureJourneySession(sessionId)
    const startRevision = session.revision
    const journey = clone(session.document)
    const event = journey.events.find(
      (candidate): candidate is TransitEvent =>
        candidate.id === input.eventId && candidate.type === "TRANSIT"
    )
    if (!event) throw new DraftInputError("Transit event not found")
    const request = buildTransitPlanRequest(event, journey.events)
    if (!request) throw new DraftInputError("Transit endpoints are incomplete")
    const bundle = await this.transitPlanning.plan(request)
    if (session.revision !== startRevision) {
      throw new DraftInputError("Draft changed while planning transit")
    }
    const currentRequest = buildTransitPlanRequest(event, journey.events)
    if (
      !currentRequest ||
      transitPlanFingerprint(currentRequest) !== bundle.requestFingerprint
    ) {
      throw new DraftInputError("Transit changed while planning")
    }
    const index = journey.events.findIndex(
      (candidate) => candidate.id === event.id
    )
    journey.events[index] = applyTransitPlanBundle(event, bundle)
    return this.commitJourney(
      session,
      journey,
      "journey.plan_transit",
      event.id
    )
  }

  journeySelectTransitPlan(sessionId: string, input: SelectTransitPlanInput) {
    const session = this.ensureJourneySession(sessionId)
    const journey = clone(session.document)
    const event = journey.events.find(
      (candidate): candidate is TransitEvent =>
        candidate.id === input.eventId && candidate.type === "TRANSIT"
    )
    if (!event) throw new DraftInputError("Transit event not found")
    if (!event.detail.plans?.some((plan) => plan.id === input.planId)) {
      throw new DraftInputError("Transit plan not found")
    }
    event.detail.selectedPlanId = input.planId
    const selected = selectedTransitPlan(event)
    if (selected) {
      event.detail.plannedDurationMinutes = Math.max(
        1,
        Math.round(selected.durationSeconds / 60)
      )
      event.detail.plannedDistanceKm =
        Math.round((selected.distanceMeters / 1000) * 10) / 10
      event.detail.plannedCostEstimate = selected.fareAmount
    }
    return this.commitJourney(
      session,
      journey,
      "journey.select_transit_plan",
      event.id
    )
  }

  journeyUndo(sessionId: string, input: UndoJourneyInput) {
    const session = this.ensureSession(sessionId)
    const steps = Math.max(1, Math.floor(input.steps ?? 1))
    if (session.revisions.length < steps) {
      throw new DraftInputError("No matching revision to undo")
    }
    const target = session.revisions[session.revisions.length - steps]
    if (!target) throw new DraftInputError("No matching revision to undo")
    const before = session.document ? clone(session.document) : null
    session.document = target.before ? clone(target.before) : null
    if (session.document) validatedJourney(toJourneyInput(session.document))
    this.recordRevision(session, "journey.undo", target.eventId, before)
    return this.getSnapshot(sessionId)
  }

  async callTool(
    sessionId: string,
    tool: JourneyToolName,
    input: Record<string, unknown>
  ) {
    if (tool === "get_current_journey") return this.getSnapshot(sessionId)
    const session = this.ensureSession(sessionId)
    const idempotencyKey =
      typeof input.idempotencyKey === "string"
        ? input.idempotencyKey.trim()
        : undefined
    if (!idempotencyKey) {
      throw new DraftInputError("idempotencyKey is required")
    }
    if (
      session.revisions.some(
        (revision) => revision.idempotencyKey === idempotencyKey
      )
    ) {
      return this.getSnapshot(sessionId)
    }
    if (
      typeof input.expectedRevision !== "number" ||
      !Number.isInteger(input.expectedRevision) ||
      input.expectedRevision < 0
    ) {
      throw new DraftInputError("expectedRevision is required")
    }
    if (input.expectedRevision !== session.revision) {
      throw new DraftInputError(
        `Draft revision conflict: expected ${input.expectedRevision}, current ${session.revision}`
      )
    }

    let result: DraftSnapshot
    if (tool === "replace_journey") {
      result = this.replaceDraft(
        sessionId,
        input.journey as JourneyInput | Journey | null
      )
    } else if (tool === "journey.add_event") {
      result = this.journeyAddEvent(
        sessionId,
        input as unknown as JourneyAddEventInput
      )
    } else if (tool === "journey.move_event") {
      result = this.journeyMoveEvent(
        sessionId,
        input as unknown as JourneyMoveEventInput
      )
    } else if (tool === "journey.remove_event") {
      result = this.journeyRemoveEvent(
        sessionId,
        input as unknown as JourneyRemoveEventInput
      )
    } else if (tool === "journey.update_event") {
      result = this.journeyUpdateEvent(
        sessionId,
        input as unknown as JourneyUpdateEventInput
      )
    } else if (tool === "journey.replace_event") {
      result = this.journeyReplaceEvent(
        sessionId,
        input as unknown as JourneyReplaceEventInput
      )
    } else if (tool === "journey.link_place") {
      result = this.journeyLinkPlace(
        sessionId,
        input as unknown as JourneyLinkPlaceInput
      )
    } else if (tool === "journey.plan_transit") {
      result = await this.journeyPlanTransit(
        sessionId,
        input as unknown as PlanTransitInput
      )
    } else if (tool === "journey.select_transit_plan") {
      result = this.journeySelectTransitPlan(
        sessionId,
        input as unknown as SelectTransitPlanInput
      )
    } else if (tool === "journey.undo") {
      result = this.journeyUndo(sessionId, input as unknown as UndoJourneyInput)
    } else {
      throw new DraftInputError("Unknown journey command")
    }

    if (idempotencyKey) {
      const revision = session.revisions.at(-1)
      if (revision) revision.idempotencyKey = idempotencyKey
    }
    return result
  }

  private commitJourney(
    session: SessionDraft & { document: DraftJourney },
    journey: DraftJourney,
    operation: JourneyToolName,
    eventId?: string
  ) {
    const before = clone(session.document)
    validatedJourney(toJourneyInput(journey))
    session.document = journey
    this.recordRevision(session, operation, eventId, before)
    return this.getSnapshot(session.sessionId)
  }

  private recordRevision(
    session: SessionDraft,
    operation: JourneyToolName | "draft.replace",
    eventId: string | undefined,
    before: DraftJourney | null
  ) {
    this.touchSession(session)
    session.revisions.push({
      id: `revision-${randomUUID()}`,
      revision: session.revision,
      operation,
      eventId,
      before,
      after: session.document ? clone(session.document) : null,
      createdAt: nowIso(),
    })
    if (session.revisions.length > 100) session.revisions.shift()
  }

  private ensureJourneySession(sessionId: string) {
    const session = this.ensureSession(sessionId)
    if (!session.document) throw new DraftInputError("Draft journey is empty")
    return session as SessionDraft & { document: DraftJourney }
  }

  private touchSession(session: SessionDraft, dirty = true) {
    session.revision += 1
    if (dirty) session.dirty = true
    session.updatedAt = nowIso()
    session.pendingSuggestions = session.pendingSuggestions.filter(
      (suggestion) => suggestion.draftRevision === session.revision
    )
  }

  private ensureSession(sessionId: string) {
    const existing = this.sessions.get(sessionId)
    if (existing) return existing
    const session: SessionDraft = {
      sessionId,
      userContext: null,
      document: null,
      sourceJourneyId: null,
      baseRevision: null,
      dirty: false,
      lockedByRunId: null,
      conversationMessages: [],
      pendingSuggestions: [],
      revisions: [],
      revision: 0,
      updatedAt: nowIso(),
    }
    this.sessions.set(sessionId, session)
    return session
  }

  private addConversationMessage(
    sessionId: string,
    input: Pick<AgentConversationMessage, "role" | "content" | "runId">
  ) {
    const session = this.ensureSession(sessionId)
    const timestamp = nowIso()
    const message: AgentConversationMessage = {
      id: `message-${randomUUID()}`,
      role: input.role,
      content: input.content,
      runId: input.runId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    session.conversationMessages.push(message)
    session.updatedAt = timestamp
    return { ...message }
  }
}
