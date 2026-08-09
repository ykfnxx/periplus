import { createHash, randomUUID } from "node:crypto"
import type { z } from "zod"
import type { AuthContext } from "@/modules/auth/server/context"
import type { HotelCandidate, HotelProviderWarning } from "@/lib/hotels/types"
import type {
  PlaceImage,
  PlaceResolveResult,
  PlaceSearchResult,
  PlaceVerification,
  ProviderWarning,
} from "@/lib/places/types"
import type {
  PlanValidationIssue,
  PlanValidationReport,
  TargetJourneyEvent,
  TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import { resolveJourneyProjection } from "@/modules/data/journeys/journey-projection"
import {
  WorkspaceCommandService,
  type AgentDraftCandidate,
  type JourneyCommand,
  type PreparedAgentDraft,
} from "@/modules/workspace/server/workspace-command-service"
import {
  MAX_AGENT_DRAFT_REPAIRS,
  draftMutationRequestSchemas,
  type DraftMutationToolName,
} from "@/backend/mcp/schemas/draft"
import { WorkspaceInputError } from "@/modules/data/workspaces/workspace-repository"

type DraftState = "BUILDING" | "INVALID" | "VALID" | "COMMITTED"

export type DraftMutationRequest = {
  [TName in DraftMutationToolName]: { type: TName } & z.infer<
    (typeof draftMutationRequestSchemas)[TName]
  >
}[DraftMutationToolName]

export type DraftWarning = {
  provider?: string
  code: string
  message: string
  cardId?: string
}

export type DraftIssue = {
  issueId: string
  code: string
  severity: "ERROR" | "WARNING"
  message: string
  repairability: "AGENT" | "USER" | "NONE"
  scopeCityCardId?: string | null
  cardIds: string[]
  linkIds: string[]
  allowedTools: string[]
}

export type DraftValidation = {
  valid: boolean
  issues: DraftIssue[]
  repairsUsed: number
  repairsRemaining: number
}

export type DraftMutationResult = {
  draftId: string
  acceptedOperationId: string
  changedCardIds: string[]
  draftState: Exclude<DraftState, "COMMITTED">
  warnings: DraftWarning[]
  canonicalTitle?: string
  linkId?: string
}

type PlaceEvidence = {
  place: PlaceSearchResult
  verification: PlaceVerification
  warnings: ProviderWarning[]
}

export type HotelSelection = {
  candidate: HotelCandidate
  verification: PlaceVerification
  stayDetail: {
    plannedLat: number
    plannedLng: number
    coordinateSystem: "WGS84"
    coordinateProvider: "rollinggo"
    providerPlaceId: string
    hotelOffer: {
      provider: "rollinggo"
      providerHotelId: string
      address?: string
      startingPrice?: { amount: number; currency: string }
      coverImageUrl?: string
      externalUrl?: string
      fetchedAt: string
    }
  }
  warnings: HotelProviderWarning[]
}

type StoredOperation<T> = {
  fingerprint: string
  result: T
}

const LOCATION_TYPES = new Set(["VISIT", "STAY", "MEAL", "ACTIVITY"])

function isLocationEvent(
  event: TargetJourneyEvent
): event is Extract<
  TargetJourneyEvent,
  { type: "VISIT" | "STAY" | "MEAL" | "ACTIVITY" }
> {
  return LOCATION_TYPES.has(event.type)
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

function requireEvent(graph: TargetJourneyGraphSnapshot, cardId: string) {
  const event = graph.events.find(
    (candidate) =>
      candidate.id === cardId && activeAtRevision(candidate, graph.revision)
  )
  if (!event)
    throw new WorkspaceInputError(`Active card ${cardId} was not found`)
  return event
}

function canonicalPosition(
  position: z.infer<
    (typeof draftMutationRequestSchemas)["draft.move_card"]
  >["position"]
) {
  if ("scopeCityCardId" in position) {
    return {
      placement: position.placement,
      parentSectionEventId: position.scopeCityCardId,
    } as const
  }
  return {
    placement: position.placement,
    anchorEventId: position.anchorCardId,
  } as const
}

function eventScope(graph: TargetJourneyGraphSnapshot, cardId: string) {
  return requireEvent(graph, cardId).parentSectionEventId
}

function assertPositionScope(
  graph: TargetJourneyGraphSnapshot,
  position: z.infer<
    (typeof draftMutationRequestSchemas)["draft.move_card"]
  >["position"],
  expectedScope: string | null
) {
  const scope =
    "scopeCityCardId" in position
      ? position.scopeCityCardId
      : eventScope(graph, position.anchorCardId)
  if (scope !== expectedScope) {
    throw new WorkspaceInputError(
      "Card position must stay in the requested scope"
    )
  }
}

function assertCity(graph: TargetJourneyGraphSnapshot, cardId: string) {
  const event = requireEvent(graph, cardId)
  if (event.type !== "SECTION" || event.detail.kind !== "CITY") {
    throw new WorkspaceInputError(`Card ${cardId} is not a CITY`)
  }
  return event
}

function targetCoordinateSystem(
  coordinateSystem: PlaceVerification["ref"]["coordinateSystem"]
): "WGS84" | "GCJ02" | "BD09" {
  return coordinateSystem === "BD09LL" ? "BD09" : coordinateSystem
}

function placeDetail(
  evidence: PlaceEvidence,
  plannedDurationMinutes?: number,
  coverImage?: PlaceImage
) {
  const ref = evidence.verification.ref
  return {
    ...(evidence.place.placeId
      ? { plannedPlaceId: evidence.place.placeId }
      : {}),
    plannedLat: ref.lat,
    plannedLng: ref.lng,
    coordinateSystem: targetCoordinateSystem(ref.coordinateSystem),
    coordinateProvider: ref.provider,
    ...(ref.providerId ? { providerPlaceId: ref.providerId } : {}),
    ...(plannedDurationMinutes === undefined ? {} : { plannedDurationMinutes }),
    ...(coverImage?.provider === "amap"
      ? {
          providerCoverImage: {
            provider: "amap" as const,
            url: coverImage.url,
            fetchedAt: coverImage.fetchedAt,
            ...(coverImage.width ? { width: coverImage.width } : {}),
            ...(coverImage.height ? { height: coverImage.height } : {}),
          },
        }
      : {}),
  }
}

function placeDetailPatch(
  evidence: PlaceEvidence,
  cardType: "VISIT" | "STAY" | "MEAL" | "ACTIVITY",
  coverImage?: PlaceImage
) {
  const ref = evidence.verification.ref
  return {
    plannedPlaceId: evidence.place.placeId ?? null,
    plannedLat: ref.lat,
    plannedLng: ref.lng,
    coordinateSystem: targetCoordinateSystem(ref.coordinateSystem),
    coordinateProvider: ref.provider,
    providerPlaceId: ref.providerId ?? null,
    ...(cardType === "VISIT"
      ? {
          providerCoverImage:
            coverImage?.provider === "amap"
              ? {
                  provider: "amap" as const,
                  url: coverImage.url,
                  fetchedAt: coverImage.fetchedAt,
                  ...(coverImage.width ? { width: coverImage.width } : {}),
                  ...(coverImage.height ? { height: coverImage.height } : {}),
                }
              : null,
        }
      : {}),
    ...(cardType === "STAY" ? { hotelOffer: null } : {}),
  }
}

function warningOutput(
  warnings: readonly (ProviderWarning | HotelProviderWarning)[],
  cardId?: string
): DraftWarning[] {
  return warnings.map((warning) => ({
    provider: warning.provider,
    code: warning.code,
    message: warning.message,
    ...(cardId ? { cardId } : {}),
  }))
}

function selectedHotelStay(
  candidate: HotelCandidate
): HotelSelection["stayDetail"] {
  return {
    plannedLat: candidate.coordinates.lat,
    plannedLng: candidate.coordinates.lng,
    coordinateSystem: "WGS84",
    coordinateProvider: "rollinggo",
    providerPlaceId: candidate.providerHotelId,
    hotelOffer: {
      provider: candidate.provider,
      providerHotelId: candidate.providerHotelId,
      address: candidate.address,
      startingPrice: candidate.startingPrice,
      coverImageUrl: candidate.imageUrl,
      externalUrl: candidate.externalUrl,
      fetchedAt: candidate.fetchedAt,
    },
  }
}

function issueId(draftId: string, issue: PlanValidationIssue, index: number) {
  return `issue-${createHash("sha256")
    .update(
      JSON.stringify({
        draftId,
        index,
        code: issue.code,
        path: issue.path,
        eventIds: issue.eventIds,
      })
    )
    .digest("hex")
    .slice(0, 20)}`
}

function allowedToolsForIssue(
  issue: PlanValidationIssue,
  graph: TargetJourneyGraphSnapshot
) {
  const firstEvent = issue.eventIds[0]
    ? graph.events.find((event) => event.id === issue.eventIds[0])
    : undefined
  switch (issue.code) {
    case "TRANSIT_ROUTE_NOT_READY":
      return ["periplus.draft.prepare_transit"]
    case "TRANSIT_ENDPOINT_MISMATCH":
      return [
        "periplus.draft.move_card",
        "periplus.draft.remove_card",
        ...(issue.eventIds.length > 1
          ? ["periplus.draft.connect_cards", "periplus.draft.disconnect_cards"]
          : []),
      ]
    case "TIME_ORDER_INVALID":
      return ["periplus.draft.update_schedule", "periplus.draft.move_card"]
    case "PLANNED_START_MISSING":
      return ["periplus.draft.update_schedule"]
    case "CITY_TIMEZONE_INVALID":
      return ["periplus.draft.update_city_card"]
    case "CITY_ROUTE_EMPTY":
      return [
        "periplus.draft.add_place_card",
        "periplus.draft.add_hotel_stay_card",
        "periplus.draft.add_place_stay_card",
      ]
    case "MISSING_TRANSIT_BETWEEN":
      return ["periplus.draft.add_transit_card"]
    case "CROSS_CITY_CONNECTION":
      return ["periplus.draft.disconnect_cards"]
    case "PROJECTION_INVALID":
      return ["periplus.draft.connect_cards", "periplus.draft.disconnect_cards"]
    case "ROOT_EVENT_TYPE_INVALID":
    case "CITY_EVENT_TYPE_INVALID":
      return ["periplus.draft.move_card", "periplus.draft.remove_card"]
    case "ROOT_ROUTE_DISCONNECTED":
      if (!firstEvent) return ["periplus.draft.add_city_card"]
      if (firstEvent.type === "TRANSIT") {
        return [
          "periplus.draft.add_city_card",
          "periplus.draft.move_card",
          "periplus.draft.remove_card",
        ]
      }
      return [
        "periplus.draft.add_transit_card",
        "periplus.draft.move_card",
        "periplus.draft.remove_card",
      ]
    case "PLACE_UNVERIFIED": {
      const tools = ["periplus.place.resolve", "periplus.draft.change_place"]
      if (issue.allowedOperations.includes("place.enrich")) {
        tools.splice(1, 0, "periplus.place.enrich")
      }
      if (issue.allowedOperations.includes("journey.move_event")) {
        tools.push("periplus.draft.move_card")
      }
      return tools
    }
    case "IMAGE_UNAVAILABLE":
    default:
      return []
  }
}

function externalIssue(
  draftId: string,
  issue: PlanValidationIssue,
  index: number,
  graph: TargetJourneyGraphSnapshot,
  repairsUsed: number
): DraftIssue {
  const firstEvent = issue.eventIds[0]
    ? graph.events.find((event) => event.id === issue.eventIds[0])
    : undefined
  const disconnectedScope =
    issue.code === "PROJECTION_INVALID"
      ? issue.message.match(
          /^active scope (.+) is disconnected at Events /
        )?.[1]
      : undefined
  const scopeCityCardId =
    disconnectedScope === "<root>"
      ? null
      : (disconnectedScope ??
        issue.cityEventId ??
        firstEvent?.parentSectionEventId ??
        null)
  const cardIds =
    issue.code === "PROJECTION_INVALID"
      ? activeEvents(graph)
          .filter((event) => event.parentSectionEventId === scopeCityCardId)
          .map((event) => event.id)
      : issue.eventIds
  const cardIdSet = new Set(cardIds)
  const linkIds = activeLinks(graph)
    .filter(
      (link) =>
        link.id === issue.path ||
        (cardIdSet.has(link.fromEventId) && cardIdSet.has(link.toEventId))
    )
    .map((link) => link.id)
  const allowedTools = allowedToolsForIssue(issue, graph)
  const repairability =
    issue.severity === "WARNING"
      ? "NONE"
      : allowedTools.length === 0
        ? "USER"
        : issue.code !== "TRANSIT_ROUTE_NOT_READY" &&
            repairsUsed >= MAX_AGENT_DRAFT_REPAIRS
          ? "USER"
          : "AGENT"
  return {
    issueId: issueId(draftId, issue, index),
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    repairability,
    scopeCityCardId,
    cardIds,
    linkIds,
    allowedTools,
  }
}

function externalValidation(
  draftId: string,
  report: PlanValidationReport,
  graph: TargetJourneyGraphSnapshot,
  repairsUsed: number
): DraftValidation {
  return {
    valid: report.valid,
    issues: report.issues.map((issue, index) =>
      externalIssue(draftId, issue, index, graph, repairsUsed)
    ),
    repairsUsed,
    repairsRemaining: Math.max(0, MAX_AGENT_DRAFT_REPAIRS - repairsUsed),
  }
}

function changedCards(
  before: TargetJourneyGraphSnapshot,
  after: TargetJourneyGraphSnapshot
) {
  const beforeById = new Map(before.events.map((event) => [event.id, event]))
  const afterById = new Map(after.events.map((event) => [event.id, event]))
  return Array.from(new Set([...beforeById.keys(), ...afterById.keys()]))
    .filter(
      (id) =>
        JSON.stringify(beforeById.get(id)) !== JSON.stringify(afterById.get(id))
    )
    .sort()
}

function updateChangesEvent(
  event: TargetJourneyEvent,
  patch: Record<string, unknown>
) {
  for (const [key, value] of Object.entries(patch)) {
    if (key === "type") continue
    if (key === "detail" && value && typeof value === "object") {
      for (const [detailKey, detailValue] of Object.entries(value)) {
        const current = (event.detail as Record<string, unknown>)[detailKey]
        const next = detailValue === null ? undefined : detailValue
        if (JSON.stringify(current) !== JSON.stringify(next)) return true
      }
      continue
    }
    const current = (event as unknown as Record<string, unknown>)[key]
    const next = value === null ? undefined : value
    if (JSON.stringify(current) !== JSON.stringify(next)) return true
  }
  return false
}

function moveChangesOrder(
  graph: TargetJourneyGraphSnapshot,
  eventId: string,
  position: Extract<
    JourneyCommand,
    { name: "journey.move_event" }
  >["payload"]["position"]
) {
  const event = requireEvent(graph, eventId)
  const scope =
    position.placement === "START" || position.placement === "END"
      ? position.parentSectionEventId
      : position.placement === "BEFORE" || position.placement === "AFTER"
        ? eventScope(graph, position.anchorEventId)
        : event.parentSectionEventId
  if (event.parentSectionEventId !== scope) return true
  let order: string[]
  try {
    order = resolveJourneyProjection({
      graph,
      scopeSectionEventId: scope,
      mode: "PLANNER",
    }).events.map((item) => item.eventId)
  } catch {
    return true
  }
  const eventIndex = order.indexOf(eventId)
  if (position.placement === "START") return eventIndex !== 0
  if (position.placement === "END") return eventIndex !== order.length - 1
  if (position.placement !== "BEFORE" && position.placement !== "AFTER") {
    return true
  }
  const anchorIndex = order.indexOf(position.anchorEventId)
  return position.placement === "BEFORE"
    ? eventIndex + 1 !== anchorIndex
    : anchorIndex + 1 !== eventIndex
}

function mutationChangesDraft(
  draft: AgentDraftCandidate,
  commands: readonly JourneyCommand[]
) {
  return commands.some((command) => {
    if (command.name === "journey.update_event") {
      return updateChangesEvent(
        requireEvent(draft.after, command.payload.eventId),
        command.payload.patch as Record<string, unknown>
      )
    }
    if (command.name === "journey.move_event") {
      return moveChangesOrder(
        draft.after,
        command.payload.eventId,
        command.payload.position
      )
    }
    return true
  })
}

function isScopeEvent(
  draft: AgentDraftCandidate,
  eventId: string,
  scopeEventId: string | null
) {
  return (
    draft.after.events.find((event) => event.id === eventId)
      ?.parentSectionEventId === scopeEventId
  )
}

function isScopeLink(
  draft: AgentDraftCandidate,
  linkId: string,
  scopeEventId: string | null
) {
  const link = draft.after.links.find((candidate) => candidate.id === linkId)
  return Boolean(
    link &&
    isScopeEvent(draft, link.fromEventId, scopeEventId) &&
    isScopeEvent(draft, link.toEventId, scopeEventId)
  )
}

function repairCommandTargetsIssue(
  command: JourneyCommand,
  issue: PlanValidationIssue,
  draft: AgentDraftCandidate
) {
  if (issue.code === "ROOT_ROUTE_DISCONNECTED") {
    if (
      command.name === "journey.move_event" ||
      command.name === "journey.retire_event"
    ) {
      return issue.eventIds.includes(command.payload.eventId)
    }
    if (command.name !== "journey.add_event") return false
    const event = command.payload.event
    if (event.type === "SECTION" && event.detail.kind === "CITY") {
      const position = command.payload.position
      return (
        (position.placement === "START" || position.placement === "END") &&
        position.parentSectionEventId === null &&
        (issue.eventIds.length === 0 || position.placement === "END")
      )
    }
    if (event.type === "TRANSIT") {
      return issue.eventIds.some(
        (eventId) =>
          event.detail.plannedFromEventId === eventId ||
          event.detail.plannedToEventId === eventId
      )
    }
    return false
  }
  if (issue.code === "PROJECTION_INVALID") {
    const scope = issue.cityEventId ?? null
    if (command.name === "journey.add_link") {
      return (
        isScopeEvent(draft, command.payload.link.fromEventId, scope) &&
        isScopeEvent(draft, command.payload.link.toEventId, scope)
      )
    }
    if (command.name === "journey.retire_link") {
      return isScopeLink(draft, command.payload.linkId, scope)
    }
    return false
  }
  const eventIds = new Set(issue.eventIds)
  const linksIssueCards = (linkId: string) => {
    const link = draft.after.links.find((candidate) => candidate.id === linkId)
    return Boolean(
      link && eventIds.has(link.fromEventId) && eventIds.has(link.toEventId)
    )
  }
  switch (command.name) {
    case "journey.add_event": {
      const position = command.payload.position
      if (position.placement === "START" || position.placement === "END") {
        return Boolean(
          position.parentSectionEventId &&
          eventIds.has(position.parentSectionEventId)
        )
      }
      if (position.placement === "BEFORE" || position.placement === "AFTER") {
        return eventIds.has(position.anchorEventId)
      }
      return position.placement === "BRANCH"
        ? eventIds.has(position.forkEventId) ||
            eventIds.has(position.joinEventId)
        : false
    }
    case "journey.update_event":
    case "journey.move_event":
    case "journey.place_event":
    case "journey.retire_event":
    case "journey.plan_transit":
    case "journey.select_transit_plan":
      return eventIds.has(command.payload.eventId)
    case "journey.replace_event":
      return eventIds.has(command.payload.predecessorEventId)
    case "journey.add_link":
      return (
        eventIds.has(command.payload.link.fromEventId) &&
        eventIds.has(command.payload.link.toEventId)
      )
    case "journey.retire_link":
      return linksIssueCards(command.payload.linkId)
    case "journey.select_branch":
      return (
        eventIds.has(command.payload.forkEventId) ||
        linksIssueCards(command.payload.selectedLinkId)
      )
    default:
      return false
  }
}

export class AgentDraftSession {
  private draftId: string | null = null
  private openKey: string | null = null
  private state: DraftState = "BUILDING"
  private candidate: AgentDraftCandidate | null = null
  private prepared: PreparedAgentDraft | null = null
  private validation: DraftValidation | null = null
  private repairsUsed = 0
  private mutatedSinceValidation = false
  private readonly placeEvidence = new Map<string, PlaceEvidence>()
  private readonly hotelSelections = new Map<string, HotelSelection>()
  private readonly usedHotelSelectionIds = new Set<string>()
  private readonly operations = new Map<
    string,
    StoredOperation<DraftMutationResult>
  >()
  private readonly validationAttempts = new Map<
    string,
    StoredOperation<{ draftId: string; validation: DraftValidation }>
  >()
  private readonly transitOperations = new Map<
    string,
    StoredOperation<unknown>
  >()
  private commitOperation:
    | StoredOperation<{
        workspaceId: string
        newWorkspaceRevision: number
        changedCardIds: string[]
        replayed: boolean
      }>
    | undefined
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly workspaceId: string,
    private readonly runId: string,
    private readonly context: AuthContext,
    private readonly commands: WorkspaceCommandService
  ) {}

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation)
    this.queue = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  registerResolvedPlace(
    result: Extract<PlaceResolveResult, { status: "resolved" }>
  ) {
    const placeResolutionId = randomUUID()
    this.placeEvidence.set(placeResolutionId, {
      place: result.place,
      verification: { ref: result.placeRef },
      warnings: result.warnings,
    })
    return placeResolutionId
  }

  getPlaceEvidence(placeResolutionId: string) {
    const evidence = this.placeEvidence.get(placeResolutionId)
    if (!evidence) {
      throw new WorkspaceInputError(
        "placeResolutionId is invalid or belongs to another Agent run"
      )
    }
    return evidence
  }

  enrichResolvedPlace(placeResolutionId: string, images: PlaceImage[]) {
    const evidence = this.getPlaceEvidence(placeResolutionId)
    const coverImage = images.find((image) => image.provider === "amap")
    if (coverImage)
      evidence.verification = { ...evidence.verification, coverImage }
    return evidence
  }

  registerHotelSelection(
    candidate: HotelCandidate,
    warnings: HotelProviderWarning[]
  ) {
    const hotelSelectionId = randomUUID()
    this.hotelSelections.set(hotelSelectionId, {
      candidate,
      verification: {
        ref: {
          provider: "rollinggo",
          providerId: candidate.providerHotelId,
          canonicalName: candidate.name,
          address: candidate.address,
          lat: candidate.coordinates.lat,
          lng: candidate.coordinates.lng,
          coordinateSystem: "WGS84",
          confidence: 1,
          candidates: [
            {
              id: candidate.candidateId,
              name: candidate.name,
              confidence: 1,
            },
          ],
        },
      },
      stayDetail: selectedHotelStay(candidate),
      warnings,
    })
    return hotelSelectionId
  }

  private requireDraft(draftId: string) {
    if (!this.draftId || !this.candidate || draftId !== this.draftId) {
      throw new WorkspaceInputError(
        "draftId is invalid or belongs to another Agent run"
      )
    }
    return this.candidate
  }

  async open(input: {
    expectedWorkspaceRevision: number
    idempotencyKey: string
  }) {
    return this.serialize(async () => {
      const fingerprint = JSON.stringify(input)
      if (this.candidate) {
        if (this.openKey !== fingerprint) {
          throw new WorkspaceInputError(
            "Only one active draft is allowed in an Agent run"
          )
        }
        return this.openResult()
      }
      this.draftId = randomUUID()
      this.openKey = fingerprint
      this.candidate = await this.commands.openAgentDraft(this.context, {
        workspaceId: this.workspaceId,
        expectedRevision: input.expectedWorkspaceRevision,
        idempotencyKey: input.idempotencyKey,
        actor: { kind: "AGENT", agentRunId: this.runId },
      })
      this.state = "BUILDING"
      return this.openResult()
    })
  }

  private openResult() {
    return {
      draftId: this.draftId!,
      baseWorkspaceRevision: this.candidate!.expectedRevision,
      draftState: this.state,
      repairsUsed: this.repairsUsed,
      repairsRemaining: MAX_AGENT_DRAFT_REPAIRS - this.repairsUsed,
    }
  }

  get(draftId: string) {
    const draft = this.requireDraft(draftId)
    const scopes = new Set<string | null>([
      null,
      ...activeEvents(draft.after)
        .filter((event) => event.type === "SECTION")
        .map((event) => event.id),
    ])
    return {
      draftId,
      draftState: this.state,
      cardsByScope: Array.from(scopes).map((scopeCityCardId) => {
        let cards: TargetJourneyEvent[] = []
        try {
          const projection = resolveJourneyProjection({
            graph: draft.after,
            scopeSectionEventId: scopeCityCardId,
            mode: "PLANNER",
          })
          const byId = new Map(
            draft.after.events.map((event) => [event.id, event])
          )
          cards = projection.events
            .map((event) => byId.get(event.eventId))
            .filter((event): event is TargetJourneyEvent => Boolean(event))
        } catch {
          cards = []
        }
        return {
          scopeCityCardId,
          cards: cards.map((event) => ({
            cardId: event.id,
            type: event.type === "SECTION" ? "CITY" : event.type,
            title: event.title,
          })),
        }
      }),
      ...(this.validation ? { latestValidation: this.validation } : {}),
      repairsUsed: this.repairsUsed,
      repairsRemaining: Math.max(0, MAX_AGENT_DRAFT_REPAIRS - this.repairsUsed),
    }
  }

  mutate(request: DraftMutationRequest) {
    return this.serialize(async () => {
      const draft = this.requireDraft(request.draftId)
      const fingerprint = JSON.stringify(request)
      const existing = this.operations.get(request.operationId)
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new WorkspaceInputError(
            "operationId was already used for a different draft mutation"
          )
        }
        return existing.result
      }
      if (this.state === "COMMITTED") {
        throw new WorkspaceInputError("Committed draft cannot be changed")
      }
      if (this.state === "VALID") {
        throw new WorkspaceInputError("VALID draft must be committed")
      }
      if (
        this.state !== "INVALID" &&
        (request.type === "draft.connect_cards" ||
          request.type === "draft.disconnect_cards")
      ) {
        throw new WorkspaceInputError(
          "Card connection tools require a validator issue"
        )
      }
      if (
        this.state === "INVALID" &&
        this.repairsUsed >= MAX_AGENT_DRAFT_REPAIRS
      ) {
        throw new WorkspaceInputError("Agent draft repair limit is exhausted")
      }

      const built = this.commandsForMutation(draft, request)
      if (this.state === "INVALID") {
        this.assertRepairAllowed(request, built.commands)
      } else if (request.issueId) {
        throw new WorkspaceInputError(
          "issueId is only valid while repairing an INVALID draft"
        )
      }
      if (!mutationChangesDraft(draft, built.commands)) {
        const result: DraftMutationResult = {
          draftId: request.draftId,
          acceptedOperationId: request.operationId,
          changedCardIds: [],
          draftState: this.state,
          warnings: built.warnings,
          ...(built.canonicalTitle
            ? { canonicalTitle: built.canonicalTitle }
            : {}),
        }
        this.operations.set(request.operationId, { fingerprint, result })
        return result
      }
      const previous = draft.after
      const next = await this.commands.applyAgentDraftMutation(this.context, {
        draft,
        operationId: request.operationId,
        commands: built.commands,
      })
      if (built.hotelSelectionId) {
        this.usedHotelSelectionIds.add(built.hotelSelectionId)
      }
      const wasRepairing = this.state === "INVALID"
      this.candidate = next
      this.state = wasRepairing ? "INVALID" : "BUILDING"
      this.mutatedSinceValidation = true
      const result: DraftMutationResult = {
        draftId: request.draftId,
        acceptedOperationId: request.operationId,
        changedCardIds: changedCards(previous, next.after),
        draftState: this.state,
        warnings: built.warnings,
        ...(built.canonicalTitle
          ? { canonicalTitle: built.canonicalTitle }
          : {}),
        ...(built.linkId ? { linkId: built.linkId } : {}),
      }
      this.operations.set(request.operationId, { fingerprint, result })
      return result
    })
  }

  private assertRepairAllowed(
    request: DraftMutationRequest,
    commands: JourneyCommand[]
  ) {
    if (!request.issueId || !this.prepared) {
      throw new WorkspaceInputError(
        "INVALID draft mutations require the latest issueId"
      )
    }
    const external = this.validation?.issues.find(
      (issue) => issue.issueId === request.issueId
    )
    const index = this.validation?.issues.findIndex(
      (issue) => issue.issueId === request.issueId
    )
    const internal =
      index === undefined || index < 0
        ? undefined
        : this.prepared.validation.issues[index]
    const toolName = `periplus.${request.type}`
    if (
      !external ||
      !internal ||
      !external.allowedTools.includes(toolName) ||
      commands.some(
        (command) =>
          !repairCommandTargetsIssue(command, internal, this.prepared!)
      )
    ) {
      throw new WorkspaceInputError(
        `${toolName} does not target the referenced validator issue`
      )
    }
  }

  private commandsForMutation(
    draft: AgentDraftCandidate,
    request: DraftMutationRequest
  ): {
    commands: JourneyCommand[]
    warnings: DraftWarning[]
    canonicalTitle?: string
    linkId?: string
    hotelSelectionId?: string
  } {
    const graph = draft.after
    switch (request.type) {
      case "draft.add_city_card": {
        assertPositionScope(graph, request.position, null)
        return {
          commands: [
            {
              name: "journey.add_event",
              payload: {
                event: {
                  id: request.card.cardId,
                  type: "SECTION",
                  title: request.card.title,
                  description: request.card.description,
                  detail: { kind: "CITY", timeZone: request.card.timeZone },
                },
                position: canonicalPosition(request.position),
              },
            },
          ],
          warnings: [],
        }
      }
      case "draft.add_place_card": {
        assertCity(graph, request.cityCardId)
        assertPositionScope(graph, request.position, request.cityCardId)
        const evidence = this.getPlaceEvidence(request.card.placeResolutionId)
        const coverImage =
          request.card.type === "VISIT" &&
          request.card.includeAvailableCoverImage
            ? evidence.verification.coverImage
            : undefined
        const common = {
          id: request.card.cardId,
          type: request.card.type,
          title: evidence.verification.ref.canonicalName,
          description: request.card.description,
          plannedStartAt: request.card.plannedStartAt,
          plannedEndAt: request.card.plannedEndAt,
        }
        const event =
          request.card.type === "VISIT"
            ? {
                ...common,
                type: "VISIT" as const,
                detail: placeDetail(
                  evidence,
                  request.card.plannedDurationMinutes,
                  coverImage
                ),
              }
            : request.card.type === "MEAL"
              ? {
                  ...common,
                  type: "MEAL" as const,
                  detail: {
                    ...placeDetail(
                      evidence,
                      request.card.plannedDurationMinutes
                    ),
                    cuisine: request.card.cuisine,
                  },
                }
              : {
                  ...common,
                  type: "ACTIVITY" as const,
                  detail: {
                    ...placeDetail(
                      evidence,
                      request.card.plannedDurationMinutes
                    ),
                    bookingReference: request.card.bookingReference,
                  },
                }
        return {
          commands: [
            {
              name: "journey.add_event",
              payload: { event, position: canonicalPosition(request.position) },
            },
          ],
          warnings: warningOutput(evidence.warnings, request.card.cardId),
          canonicalTitle: evidence.verification.ref.canonicalName,
        }
      }
      case "draft.add_hotel_stay_card": {
        assertCity(graph, request.cityCardId)
        assertPositionScope(graph, request.position, request.cityCardId)
        const selection = this.hotelSelections.get(
          request.card.hotelSelectionId
        )
        if (!selection) {
          throw new WorkspaceInputError(
            "hotelSelectionId is invalid or belongs to another Agent run"
          )
        }
        if (this.usedHotelSelectionIds.has(request.card.hotelSelectionId)) {
          throw new WorkspaceInputError(
            "A hotelSelectionId can be materialized only once"
          )
        }
        return {
          commands: [
            {
              name: "journey.add_event",
              payload: {
                event: {
                  id: request.card.cardId,
                  type: "STAY",
                  title: selection.candidate.name,
                  description: request.card.description,
                  plannedStartAt: request.card.plannedStartAt,
                  plannedEndAt: request.card.plannedEndAt,
                  detail: {
                    ...selection.stayDetail,
                    checkInNote: request.card.checkInNote,
                  },
                },
                position: canonicalPosition(request.position),
              },
            },
          ],
          warnings: warningOutput(selection.warnings, request.card.cardId),
          canonicalTitle: selection.candidate.name,
          hotelSelectionId: request.card.hotelSelectionId,
        }
      }
      case "draft.add_place_stay_card": {
        assertCity(graph, request.cityCardId)
        assertPositionScope(graph, request.position, request.cityCardId)
        const evidence = this.getPlaceEvidence(request.card.placeResolutionId)
        return {
          commands: [
            {
              name: "journey.add_event",
              payload: {
                event: {
                  id: request.card.cardId,
                  type: "STAY",
                  title: evidence.verification.ref.canonicalName,
                  description: request.card.description,
                  plannedStartAt: request.card.plannedStartAt,
                  plannedEndAt: request.card.plannedEndAt,
                  detail: {
                    ...placeDetail(evidence),
                    checkInNote: request.card.checkInNote,
                  },
                },
                position: canonicalPosition(request.position),
              },
            },
          ],
          warnings: warningOutput(evidence.warnings, request.card.cardId),
          canonicalTitle: evidence.verification.ref.canonicalName,
        }
      }
      case "draft.add_transit_card": {
        const from = requireEvent(graph, request.card.fromCardId)
        const to = requireEvent(graph, request.card.toCardId)
        if (from.parentSectionEventId !== to.parentSectionEventId) {
          throw new WorkspaceInputError(
            "Transit endpoints must belong to the same scope"
          )
        }
        const adjacent = activeLinks(graph).some(
          (link) =>
            link.kind === "MAIN" &&
            link.fromEventId === from.id &&
            link.toEventId === to.id
        )
        if (!adjacent) {
          throw new WorkspaceInputError(
            "Transit endpoints must be adjacent in the current linear chain"
          )
        }
        if (
          from.parentSectionEventId === null &&
          (from.type !== "SECTION" || to.type !== "SECTION")
        ) {
          throw new WorkspaceInputError(
            "Root Transit endpoints must both be CITY cards"
          )
        }
        if (
          from.parentSectionEventId !== null &&
          (!LOCATION_TYPES.has(from.type) || !LOCATION_TYPES.has(to.type))
        ) {
          throw new WorkspaceInputError(
            "City Transit endpoints must both be location cards"
          )
        }
        return {
          commands: [
            {
              name: "journey.add_event",
              payload: {
                event: {
                  id: request.card.cardId,
                  type: "TRANSIT",
                  title: request.card.title ?? `${from.title} → ${to.title}`,
                  description: request.card.description,
                  plannedStartAt: request.card.plannedStartAt,
                  plannedEndAt: request.card.plannedEndAt,
                  detail: {
                    plannedFromEventId: from.id,
                    plannedToEventId: to.id,
                    transportMode: request.card.transportMode,
                    requestMode: request.card.requestMode,
                    preference: request.card.preference,
                    plannedDepartAt: request.card.plannedDepartAt,
                    notes: request.card.notes,
                  },
                },
                position: { placement: "AFTER", anchorEventId: from.id },
              },
            },
          ],
          warnings: [],
        }
      }
      case "draft.update_city_card": {
        const city = assertCity(graph, request.cardId)
        return {
          commands: [
            {
              name: "journey.update_event",
              payload: {
                eventId: request.cardId,
                patch: {
                  type: "SECTION",
                  ...(request.patch.title === undefined
                    ? {}
                    : { title: request.patch.title }),
                  ...(request.patch.description === undefined
                    ? {}
                    : { description: request.patch.description }),
                  ...(request.patch.timeZone
                    ? {
                        detail: {
                          ...city.detail,
                          timeZone: request.patch.timeZone,
                        },
                      }
                    : {}),
                },
              },
            },
          ],
          warnings: [],
        }
      }
      case "draft.update_schedule": {
        const event = requireEvent(graph, request.cardId)
        if (event.type === "SECTION" || event.type === "NOTE") {
          throw new WorkspaceInputError("Only executable cards have schedules")
        }
        return {
          commands: [
            {
              name: "journey.update_event",
              payload: {
                eventId: event.id,
                patch: { type: event.type, ...request.patch },
              },
            },
          ],
          warnings: [],
        }
      }
      case "draft.change_place": {
        const event = requireEvent(graph, request.cardId)
        if (!isLocationEvent(event)) {
          throw new WorkspaceInputError(
            "Only VISIT, STAY, MEAL, or ACTIVITY cards have places"
          )
        }
        const evidence = this.getPlaceEvidence(request.placeResolutionId)
        const coverImage =
          event.type === "VISIT" && request.includeAvailableCoverImage
            ? evidence.verification.coverImage
            : undefined
        return {
          commands: [
            {
              name: "journey.update_event",
              payload: {
                eventId: event.id,
                patch: {
                  type: event.type,
                  title: evidence.verification.ref.canonicalName,
                  detail: placeDetailPatch(evidence, event.type, coverImage),
                },
              },
            },
          ],
          warnings: warningOutput(evidence.warnings, event.id),
          canonicalTitle: evidence.verification.ref.canonicalName,
        }
      }
      case "draft.update_transit_card": {
        const event = requireEvent(graph, request.cardId)
        if (event.type !== "TRANSIT") {
          throw new WorkspaceInputError(`Card ${event.id} is not TRANSIT`)
        }
        const { plannedStartAt, plannedEndAt, ...detail } = request.patch
        return {
          commands: [
            {
              name: "journey.update_event",
              payload: {
                eventId: event.id,
                patch: {
                  type: "TRANSIT",
                  ...(plannedStartAt === undefined ? {} : { plannedStartAt }),
                  ...(plannedEndAt === undefined ? {} : { plannedEndAt }),
                  ...(Object.keys(detail).length ? { detail } : {}),
                },
              },
            },
          ],
          warnings: [],
        }
      }
      case "draft.move_card": {
        const event = requireEvent(graph, request.cardId)
        const expectedScope =
          "scopeCityCardId" in request.position
            ? request.position.scopeCityCardId
            : eventScope(graph, request.position.anchorCardId)
        if (event.type === "SECTION" && expectedScope !== null) {
          throw new WorkspaceInputError("CITY cards must remain in Root scope")
        }
        if (event.type !== "SECTION" && expectedScope === null) {
          if (event.type !== "TRANSIT") {
            throw new WorkspaceInputError(
              "Only CITY and cross-city TRANSIT cards belong to Root scope"
            )
          }
        }
        return {
          commands: [
            {
              name: "journey.move_event",
              payload: {
                eventId: event.id,
                position: canonicalPosition(request.position),
              },
            },
          ],
          warnings: [],
        }
      }
      case "draft.remove_card": {
        const event = requireEvent(graph, request.cardId)
        if (event.type === "SECTION") {
          if (!request.cityChildrenPolicy) {
            const hasChildren = activeEvents(graph).some(
              (candidate) => candidate.parentSectionEventId === event.id
            )
            if (hasChildren) {
              throw new WorkspaceInputError(
                "Removing a non-empty CITY requires cityChildrenPolicy"
              )
            }
          }
          if (request.destinationCityCardId) {
            assertCity(graph, request.destinationCityCardId)
          }
        } else if (
          request.cityChildrenPolicy ||
          request.destinationCityCardId
        ) {
          throw new WorkspaceInputError(
            "City children policy is only valid for CITY cards"
          )
        }
        return {
          commands: [
            {
              name: "journey.retire_event",
              payload: {
                eventId: event.id,
                sectionChildren:
                  request.cityChildrenPolicy === "REMOVE_ALL"
                    ? "RECURSIVE_RETIRE"
                    : request.cityChildrenPolicy === "MOVE_TO_CITY"
                      ? "MOVE_CHILDREN"
                      : undefined,
                destinationSectionEventId: request.destinationCityCardId,
              },
            },
          ],
          warnings: [],
        }
      }
      case "draft.connect_cards": {
        const from = requireEvent(graph, request.fromCardId)
        const to = requireEvent(graph, request.toCardId)
        if (from.parentSectionEventId !== to.parentSectionEventId) {
          throw new WorkspaceInputError("Connected cards must share one scope")
        }
        const linkId = `link-${createHash("sha256")
          .update(`${request.draftId}:${request.operationId}`)
          .digest("hex")
          .slice(0, 20)}`
        return {
          commands: [
            {
              name: "journey.add_link",
              payload: {
                link: {
                  id: linkId,
                  fromEventId: from.id,
                  toEventId: to.id,
                  kind: "MAIN",
                  rank: 1024,
                },
              },
            },
          ],
          warnings: [],
          linkId,
        }
      }
      case "draft.disconnect_cards": {
        const links = activeLinks(graph).filter(
          (link) =>
            link.fromEventId === request.fromCardId &&
            link.toEventId === request.toCardId
        )
        if (links.length !== 1) {
          throw new WorkspaceInputError(
            "disconnect_cards requires exactly one active matching Link"
          )
        }
        return {
          commands: [
            {
              name: "journey.retire_link",
              payload: { linkId: links[0]!.id },
            },
          ],
          warnings: [],
        }
      }
    }
  }

  validate(input: { draftId: string; attemptId: string }) {
    return this.serialize(async () => {
      const fingerprint = JSON.stringify(input)
      const existing = this.validationAttempts.get(input.attemptId)
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new WorkspaceInputError(
            "attemptId was already used for a different draft validation"
          )
        }
        return existing.result
      }
      const draft = this.requireDraft(input.draftId)
      if (this.state === "COMMITTED") {
        throw new WorkspaceInputError("Committed draft cannot be validated")
      }
      if (this.validation && !this.mutatedSinceValidation) {
        const result = { draftId: input.draftId, validation: this.validation }
        this.validationAttempts.set(input.attemptId, { fingerprint, result })
        return result
      }
      if (this.prepared && this.mutatedSinceValidation) {
        if (this.repairsUsed >= MAX_AGENT_DRAFT_REPAIRS) {
          throw new WorkspaceInputError("Agent draft repair limit is exhausted")
        }
        this.repairsUsed += 1
      }
      const prepared = this.commands.validateAgentDraft(
        draft,
        this.verifiedPlaces()
      )
      const validation = externalValidation(
        input.draftId,
        prepared.validation,
        prepared.after,
        this.repairsUsed
      )
      this.prepared = prepared
      this.validation = validation
      this.state = validation.valid ? "VALID" : "INVALID"
      this.mutatedSinceValidation = false
      const result = { draftId: input.draftId, validation }
      this.validationAttempts.set(input.attemptId, { fingerprint, result })
      return result
    })
  }

  prepareTransit(input: {
    draftId: string
    operationId: string
    transitCardId: string
  }) {
    return this.serialize(async () => {
      const draft = this.requireDraft(input.draftId)
      const fingerprint = JSON.stringify(input)
      const existing = this.transitOperations.get(input.operationId)
      if (existing) {
        if (existing.fingerprint !== fingerprint) {
          throw new WorkspaceInputError(
            "operationId was already used for a different Transit preparation"
          )
        }
        return existing.result
      }
      if (this.state !== "INVALID" || !this.prepared || !this.validation) {
        throw new WorkspaceInputError(
          "Transit preparation requires the latest INVALID draft validation"
        )
      }
      if (this.mutatedSinceValidation) {
        throw new WorkspaceInputError(
          "Validate draft repairs before preparing Transit routes"
        )
      }
      const issueIndex = this.prepared.validation.issues.findIndex(
        (issue) =>
          issue.code === "TRANSIT_ROUTE_NOT_READY" &&
          issue.eventIds.includes(input.transitCardId) &&
          issue.allowedOperations.includes("journey.plan_transit")
      )
      if (issueIndex < 0) {
        throw new WorkspaceInputError(
          "Transit preparation is not allowed by the latest validation"
        )
      }
      const next = await this.commands.prepareAgentTransit(this.context, {
        draft,
        idempotencyKey: input.operationId,
        eventId: input.transitCardId,
      })
      const prepared = this.commands.validateAgentDraft(
        next,
        this.verifiedPlaces()
      )
      const validation = externalValidation(
        input.draftId,
        prepared.validation,
        prepared.after,
        this.repairsUsed
      )
      this.candidate = next
      this.prepared = prepared
      this.validation = validation
      this.state = validation.valid ? "VALID" : "INVALID"
      this.mutatedSinceValidation = false
      const transit = requireEvent(next.after, input.transitCardId)
      if (transit.type !== "TRANSIT") {
        throw new WorkspaceInputError(
          "Transit card was not found after preparation"
        )
      }
      const run = transit.detail.activePlanningRunId
        ? next.after.transitPlanningRuns.find(
            (candidate) => candidate.id === transit.detail.activePlanningRunId
          )
        : undefined
      const selectedPlan = transit.detail.selectedPlanId
        ? run?.plans.find((plan) => plan.id === transit.detail.selectedPlanId)
        : undefined
      const warnings: DraftWarning[] = run?.warning
        ? [
            {
              provider: run.provider,
              code: "provider_warning",
              message: run.warning,
              cardId: transit.id,
            },
          ]
        : []
      const result = {
        draftId: input.draftId,
        transitCardId: transit.id,
        routeStatus: transit.detail.routeState === "READY" ? "READY" : "FAILED",
        ...(selectedPlan
          ? {
              selectedPlanSummary: {
                provider: selectedPlan.provider,
                durationMinutes: Math.round(selectedPlan.durationSeconds / 60),
                distanceKm: selectedPlan.distanceMeters / 1000,
              },
            }
          : {}),
        validation,
        warnings,
      }
      this.transitOperations.set(input.operationId, { fingerprint, result })
      return result
    })
  }

  commit(input: { draftId: string; idempotencyKey: string }) {
    return this.serialize(async () => {
      this.requireDraft(input.draftId)
      const fingerprint = JSON.stringify(input)
      if (this.commitOperation) {
        if (this.commitOperation.fingerprint !== fingerprint) {
          throw new WorkspaceInputError(
            "Draft commit idempotency key was already used"
          )
        }
        return { ...this.commitOperation.result, replayed: true }
      }
      if (this.state !== "VALID" || !this.prepared?.validation.valid) {
        throw new WorkspaceInputError("Only a VALID draft can be committed")
      }
      const result = await this.commands.commitAgentDraft(this.context, {
        ...this.prepared,
        idempotencyKey: input.idempotencyKey,
      })
      const output = {
        workspaceId: this.workspaceId,
        newWorkspaceRevision: result.newRevision,
        changedCardIds: result.changedEventIds,
        replayed: Boolean(result.replayedFromIdempotencyKey),
      }
      this.state = "COMMITTED"
      this.commitOperation = { fingerprint, result: output }
      return output
    })
  }

  private verifiedPlaces() {
    const byKey = new Map<string, PlaceVerification>()
    for (const evidence of this.placeEvidence.values()) {
      const ref = evidence.verification.ref
      const key = [
        ref.provider,
        ref.providerId ?? "",
        ref.canonicalName,
        ref.lat,
        ref.lng,
        ref.coordinateSystem,
      ].join(":")
      const current = byKey.get(key)
      if (!current?.coverImage || evidence.verification.coverImage) {
        byKey.set(key, evidence.verification)
      }
    }
    for (const selection of this.hotelSelections.values()) {
      const ref = selection.verification.ref
      byKey.set(
        [
          ref.provider,
          ref.providerId ?? "",
          ref.canonicalName,
          ref.lat,
          ref.lng,
          ref.coordinateSystem,
        ].join(":"),
        selection.verification
      )
    }
    return Array.from(byKey.values())
  }
}
