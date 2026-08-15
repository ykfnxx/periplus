import { createHash } from "node:crypto"
import type { AuthContext } from "@/modules/auth/server/context"
import type { HotelCandidate, HotelProviderWarning } from "@/lib/hotels/types"
import type {
  PlaceResolveResult,
  PlaceRef,
  PlaceSearchResponse,
} from "@/lib/places/types"
import { placeRefFromResult } from "@/modules/data/places/place-service"
import type {
  TransitPlanBundle,
  TransitPlanEndpoint,
} from "@/lib/journeys/planning"
import { projectFlatJourney } from "@/modules/data/journeys/flat-journey-projection"
import type { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"
import { WorkspaceInputError } from "@/modules/data/workspaces/workspace-repository"
import { AgentDraftSession } from "./draft-session"
import { baselineItemKey, type PlannerBaseline } from "./planner-baseline"
import type {
  MaterializedPathEvent,
  ParsedAgentToolRequest,
  ScheduleIntent,
} from "./tool-contract"

type PlaceRequest = Extract<ParsedAgentToolRequest, { type: "place.search" }>
type HotelRequest = Extract<ParsedAgentToolRequest, { type: "hotel.search" }>
type RouteRequest = Extract<ParsedAgentToolRequest, { type: "route.search" }>
type EventAddRequest = Extract<ParsedAgentToolRequest, { type: "event.add" }>
type EventUpdateRequest = Extract<
  ParsedAgentToolRequest,
  { type: "event.update" }
>
type EventMoveRequest = Extract<ParsedAgentToolRequest, { type: "event.move" }>
type EventRemoveRequest = Extract<
  ParsedAgentToolRequest,
  { type: "event.remove" }
>

type PlanningLogEntry =
  | {
      sequence: number
      type: "FACT_RESOLVED"
      subject: "PLACE" | "HOTEL" | "ROUTE"
      proposalItemKey: string
      summary: string
      data: Record<string, unknown>
    }
  | {
      sequence: number
      type: "FACT_REJECTED"
      subject: "PLACE" | "HOTEL" | "ROUTE"
      proposalItemKey: string
      code: string
      message: string
    }
  | {
      sequence: number
      type: "TOOL_REJECTED"
      tool: string
      code: string
      message: string
    }
  | {
      sequence: number
      type: "EVENT_APPENDED"
      event: MaterializedPathEvent
      afterItemKey: string | null
      reason: string
    }
  | {
      sequence: number
      type: "EVENT_REPLACED"
      itemKey: string
      event: MaterializedPathEvent
      reason: string
    }
  | {
      sequence: number
      type: "EVENT_REMOVED"
      itemKey: string
      reason: string
    }
  | {
      sequence: number
      type: "VALIDATION_RESULT"
      valid: boolean
      issueCodes: string[]
    }

type NewPlanningLogEntry<T = PlanningLogEntry> = T extends PlanningLogEntry
  ? Omit<T, "sequence">
  : never

type PlaceFact = {
  cityLabel: string
  resolved: Extract<PlaceResolveResult, { status: "resolved" }>
}
type HotelFact = {
  cityLabel: string
  candidate: HotelCandidate
  warnings: HotelProviderWarning[]
}
type RouteFact = { requirementId: string; bundle: TransitPlanBundle }

interface RouteRequirement {
  routeRequirementId: string
  fromItemKey: string
  toItemKey: string
  earliestDepartAt: string
}

interface StayRequirement {
  stayRequirementId: string
  cityLabel: string
  checkInDate: string
  checkOutDate: string
  nights: number
  anchorItemKeys: [string, string]
}

interface FoldResult {
  draft: AgentDraftSession
  itemToCardId: Map<string, string>
  transitItemToCardId: Map<string, string>
}

interface ValidatedFold extends FoldResult {
  logSequence: number
  validation: Awaited<ReturnType<AgentDraftSession["validateCurrent"]>>
}

const MAX_PATH_VALIDATIONS = 6
const MAX_CHANGE_LOG_ENTRIES = 256
const DAY_MS = 86_400_000
const DEFAULT_DURATION_MINUTES = {
  VISIT: 120,
  MEAL: 90,
  ACTIVITY: 120,
} as const

function nextSequence(entries: PlanningLogEntry[]) {
  return (entries.at(-1)?.sequence ?? 0) + 1
}

function changedEventKeys(entries: PlanningLogEntry[]) {
  return Array.from(
    new Set(
      entries.flatMap((entry) => {
        if (entry.type === "EVENT_APPENDED") {
          return [entry.event.proposalItemKey]
        }
        if (entry.type === "EVENT_REPLACED") {
          return [entry.itemKey, entry.event.proposalItemKey]
        }
        if (entry.type === "EVENT_REMOVED") return [entry.itemKey]
        return []
      })
    )
  )
}

export class PlanningSession {
  private readonly entries: PlanningLogEntry[] = []
  private readonly placeSelections = new Map<
    string,
    {
      search: PlaceRequest
      cityLabel: string
      resolved: Extract<PlaceResolveResult, { status: "resolved" }>
    }
  >()
  private readonly hotelSelections = new Map<
    string,
    {
      requirementId: string
      cityLabel: string
      candidate: HotelCandidate
      warnings: HotelProviderWarning[]
    }
  >()
  private readonly routeSelections = new Map<
    string,
    {
      requirementId: string
      bundle: TransitPlanBundle
      transportMode: NonNullable<RouteRequest["modePreference"]>
      preference: NonNullable<RouteRequest["routePreference"]>
    }
  >()
  private readonly placeFacts = new Map<string, PlaceFact>()
  private readonly hotelFacts = new Map<string, HotelFact>()
  private readonly routeFacts = new Map<string, RouteFact>()
  private validated: ValidatedFold | null = null
  private validationCount = 0

  constructor(
    private readonly workspaceId: string,
    private readonly runId: string,
    private readonly authContext: AuthContext,
    private readonly commands: WorkspaceCommandService,
    private readonly baseline: PlannerBaseline,
    private readonly defaultTripStartDate: string
  ) {}

  private append(entry: NewPlanningLogEntry) {
    if (this.entries.length >= MAX_CHANGE_LOG_ENTRIES) {
      throw new WorkspaceInputError("PATH_CHANGE_LOG_LIMIT_EXHAUSTED")
    }
    const appended = {
      sequence: nextSequence(this.entries),
      ...entry,
    } as PlanningLogEntry
    this.entries.push(appended)
    if (
      appended.type === "EVENT_APPENDED" ||
      appended.type === "EVENT_REPLACED" ||
      appended.type === "EVENT_REMOVED"
    ) {
      this.validated = null
    }
    return appended
  }

  recordPlaceSearch(request: PlaceRequest, response: PlaceSearchResponse) {
    const actionable = response.results.filter(
      (candidate) =>
        candidate.name.trim() &&
        Number.isFinite(candidate.bestCoordinate.lat) &&
        Number.isFinite(candidate.bestCoordinate.lng) &&
        candidate.sources.length > 0
    )
    const candidates = actionable.map((candidate, index) => {
      const selectionId = this.selectionId("place", {
        request,
        provider: candidate.bestCoordinate.provider,
        candidateId: candidate.id,
      })
      const cityLabel = (candidate.city ?? candidate.province ?? request.city)
        .trim()
        .replace(/\s+/gu, " ")
      const resolved: Extract<PlaceResolveResult, { status: "resolved" }> = {
        status: "resolved",
        place: candidate,
        placeRef: placeRefFromResult(candidate, actionable),
        warnings: response.warnings,
        providerAttempts: response.providerAttempts,
      }
      this.placeSelections.set(selectionId, {
        search: request,
        cityLabel,
        resolved,
      })
      return {
        selectionId,
        name: candidate.name,
        cityLabel,
        category: candidate.category,
        address: candidate.address,
        image: candidate.images?.[0]?.url,
        rank: index + 1,
      }
    })
    if (candidates[0]) {
      this.append({
        type: "FACT_RESOLVED",
        subject: "PLACE",
        proposalItemKey: candidates[0].selectionId,
        summary: `${request.query} → ${candidates.length} candidates`,
        data: { city: request.city, count: candidates.length },
      })
    }
    return {
      candidates,
      recommendedSelectionId: candidates[0]?.selectionId,
      warnings: response.warnings,
      nextAction: candidates.length ? ("ADD_OR_SEARCH" as const) : undefined,
    }
  }

  recordFactRejected(
    request: PlaceRequest | HotelRequest | RouteRequest,
    code: string,
    message: string
  ) {
    const subject =
      request.type === "place.search"
        ? ("PLACE" as const)
        : request.type === "hotel.search"
          ? ("HOTEL" as const)
          : ("ROUTE" as const)
    const proposalItemKey =
      request.type === "place.search"
        ? `${request.city}:${request.query}`
        : request.type === "hotel.search"
          ? request.stayRequirementId
          : request.routeRequirementId
    this.append({
      type: "FACT_REJECTED",
      subject,
      proposalItemKey,
      code,
      message,
    })
  }

  recordToolRejected(tool: string, code: string, message: string) {
    this.append({ type: "TOOL_REJECTED", tool, code, message })
  }

  hotelSearchInput(request: HotelRequest) {
    const requirement = this.requirements().stayRequirements.find(
      (candidate) => candidate.stayRequirementId === request.stayRequirementId
    )
    if (!requirement) {
      throw new WorkspaceInputError("STALE_STAY_REQUIREMENT")
    }
    return {
      originQuery: request.preference ?? requirement.cityLabel,
      place: requirement.cityLabel,
      placeType: "城市" as const,
      checkInDate: requirement.checkInDate,
      stayNights: requirement.nights,
      adultCount: 1,
      size: 5,
      requirement,
    }
  }

  recordHotelSearch(
    request: HotelRequest,
    candidates: HotelCandidate[],
    warnings: HotelProviderWarning[]
  ) {
    const requirement = this.requirements().stayRequirements.find(
      (candidate) => candidate.stayRequirementId === request.stayRequirementId
    )
    if (!requirement) throw new WorkspaceInputError("STALE_STAY_REQUIREMENT")
    const selections = candidates.map((candidate, index) => {
      const selectionId = this.selectionId("hotel", {
        requirementId: requirement.stayRequirementId,
        providerHotelId: candidate.providerHotelId,
      })
      this.hotelSelections.set(selectionId, {
        requirementId: requirement.stayRequirementId,
        cityLabel: requirement.cityLabel,
        candidate,
        warnings,
      })
      return {
        selectionId,
        name: candidate.name,
        address: candidate.address,
        startingPrice: candidate.startingPrice,
        image: candidate.imageUrl,
        rank: index + 1,
      }
    })
    if (selections[0]) {
      this.append({
        type: "FACT_RESOLVED",
        subject: "HOTEL",
        proposalItemKey: requirement.stayRequirementId,
        summary: `${requirement.cityLabel}住宿 → ${selections.length} candidates`,
        data: { count: selections.length },
      })
    }
    return {
      candidates: selections,
      recommendedSelectionId: selections[0]?.selectionId,
      warnings,
      nextAction: selections.length ? ("ADD_HOTEL" as const) : undefined,
    }
  }

  routeSearchInput(request: RouteRequest) {
    const requirement = this.requirements().routeRequirements.find(
      (candidate) => candidate.routeRequirementId === request.routeRequirementId
    )
    if (!requirement) throw new WorkspaceInputError("STALE_ROUTE_REQUIREMENT")
    return {
      requirement,
      origin: this.endpointForItem(requirement.fromItemKey),
      destination: this.endpointForItem(requirement.toItemKey),
    }
  }

  private endpointForItem(itemKey: string): TransitPlanEndpoint {
    const place = this.placeFacts.get(itemKey)?.resolved.placeRef
    if (place) {
      return {
        name: place.canonicalName,
        lat: place.lat,
        lng: place.lng,
        coordinateSystem: place.coordinateSystem,
        ...(place.provider === "amap" && place.providerId
          ? { providerPlaceId: place.providerId }
          : {}),
      }
    }
    const hotel = this.hotelFacts.get(itemKey)?.candidate
    if (hotel) {
      return {
        name: hotel.name,
        lat: hotel.coordinates.lat,
        lng: hotel.coordinates.lng,
        coordinateSystem: "WGS84",
      }
    }
    const baseline = this.baseline.journey.events.find(
      (event) => event.proposalItemKey === itemKey
    )?.place
    if (baseline) return baseline
    throw new WorkspaceInputError(`Missing route endpoint fact ${itemKey}`)
  }

  recordRouteSearch(request: RouteRequest, bundle: TransitPlanBundle) {
    const requirement = this.requirements().routeRequirements.find(
      (candidate) => candidate.routeRequirementId === request.routeRequirementId
    )
    if (!requirement) throw new WorkspaceInputError("STALE_ROUTE_REQUIREMENT")
    const selections = bundle.plans.map((plan, index) => {
      const selectionId = this.selectionId("route", {
        requirementId: requirement.routeRequirementId,
        fingerprint: bundle.requestFingerprint,
        planId: plan.id,
      })
      this.routeSelections.set(selectionId, {
        requirementId: requirement.routeRequirementId,
        bundle: { ...bundle, plans: [plan] },
        transportMode: request.modePreference ?? "WALK",
        preference: request.routePreference ?? "RECOMMENDED",
      })
      return {
        selectionId,
        mode: plan.segments[0]?.mode,
        durationMinutes: Math.ceil(plan.durationSeconds / 60),
        distanceKm: plan.distanceMeters / 1000,
        routeLabel: plan.label,
        rank: index + 1,
      }
    })
    if (selections[0]) {
      this.append({
        type: "FACT_RESOLVED",
        subject: "ROUTE",
        proposalItemKey: requirement.routeRequirementId,
        summary: `${requirement.fromItemKey} → ${requirement.toItemKey}`,
        data: { count: selections.length },
      })
    }
    return {
      candidates: selections,
      recommendedSelectionId: selections[0]?.selectionId,
      nextAction: selections.length ? ("ADD_ROUTE" as const) : undefined,
    }
  }

  readPath() {
    return this.planningState()
  }

  addEvent(request: EventAddRequest) {
    if (request.source === "PLACE") {
      const selection = this.placeSelections.get(request.selectionId)
      if (!selection) throw new WorkspaceInputError("PLACE_SELECTION_INVALID")
      if (selection.search.intent !== request.eventType) {
        throw new WorkspaceInputError("PLACE_SELECTION_TYPE_MISMATCH")
      }
      this.assertAnchor(request.afterItemKey)
      const itemKey = this.itemKey("place", request.selectionId)
      const event = this.materializePlaceEvent({
        itemKey,
        selection,
        eventType: request.eventType,
        afterItemKey: request.afterItemKey,
        scheduleIntent: request.scheduleIntent,
        notes: request.notes,
      })
      this.placeFacts.set(itemKey, {
        cityLabel: selection.cityLabel,
        resolved: selection.resolved,
      })
      const entry = this.append({
        type: "EVENT_APPENDED",
        event,
        afterItemKey: request.afterItemKey,
        reason: "selected place candidate",
      })
      this.removeStaleDerivedEvents()
      return {
        acceptedSequence: entry.sequence,
        itemKey,
        materializedEvent: event,
        nextAction: "COMPLETE_REQUIREMENTS_OR_CONTINUE" as const,
      }
    }

    if (request.source === "HOTEL") {
      const requirement = this.requirements().stayRequirements.find(
        (candidate) => candidate.stayRequirementId === request.stayRequirementId
      )
      const selection = this.hotelSelections.get(request.selectionId)
      if (
        !requirement ||
        !selection ||
        selection.requirementId !== requirement.stayRequirementId
      ) {
        throw new WorkspaceInputError("STALE_STAY_REQUIREMENT")
      }
      const itemKey = this.itemKey("stay", request.selectionId)
      const startAt = `${requirement.checkInDate}T22:00:00+08:00`
      const endAt = `${requirement.checkOutDate}T08:00:00+08:00`
      const event: MaterializedPathEvent = {
        proposalItemKey: itemKey,
        kind: "STAY",
        title: selection.candidate.name,
        cityQuery: selection.cityLabel,
        plannedStartAt: startAt,
        plannedEndAt: endAt,
        description: request.notes,
      }
      this.hotelFacts.set(itemKey, {
        cityLabel: selection.cityLabel,
        candidate: selection.candidate,
        warnings: selection.warnings,
      })
      const entry = this.append({
        type: "EVENT_APPENDED",
        event,
        afterItemKey: requirement.anchorItemKeys[0],
        reason: "selected hotel candidate",
      })
      return {
        acceptedSequence: entry.sequence,
        itemKey,
        materializedEvent: event,
        nextAction: "COMPLETE_REQUIREMENTS" as const,
      }
    }

    const requirement = this.requirements().routeRequirements.find(
      (candidate) => candidate.routeRequirementId === request.routeRequirementId
    )
    const selection = this.routeSelections.get(request.selectionId)
    if (
      !requirement ||
      !selection ||
      selection.requirementId !== requirement.routeRequirementId
    ) {
      throw new WorkspaceInputError("STALE_ROUTE_REQUIREMENT")
    }
    const plan = selection.bundle.plans[0]
    if (!plan) throw new WorkspaceInputError("ROUTE_SELECTION_INVALID")
    const itemKey = this.itemKey("route", request.selectionId)
    const startAt = requirement.earliestDepartAt
    const endAt = new Date(
      Date.parse(startAt) + plan.durationSeconds * 1000
    ).toISOString()
    const event: MaterializedPathEvent = {
      proposalItemKey: itemKey,
      kind: "TRANSIT",
      title: plan.label,
      fromItemKey: requirement.fromItemKey,
      toItemKey: requirement.toItemKey,
      transportMode: selection.transportMode,
      preference: selection.preference,
      plannedStartAt: startAt,
      plannedEndAt: endAt,
      notes: request.notes,
    }
    this.routeFacts.set(itemKey, {
      requirementId: requirement.routeRequirementId,
      bundle: selection.bundle,
    })
    const entry = this.append({
      type: "EVENT_APPENDED",
      event,
      afterItemKey: requirement.fromItemKey,
      reason: "selected route candidate",
    })
    this.shiftFlexibleSuffix(requirement.toItemKey, endAt)
    return {
      acceptedSequence: entry.sequence,
      itemKey,
      materializedEvent: event,
      nextAction: "COMPLETE_REQUIREMENTS" as const,
    }
  }

  updateEvent(request: EventUpdateRequest) {
    const current = this.materializedEvent(request.itemKey)
    if (current.kind === "TRANSIT" || current.kind === "STAY") {
      throw new WorkspaceInputError("DERIVED_EVENT_UPDATE_NOT_ALLOWED")
    }
    const selection = request.selectionId
      ? this.placeSelections.get(request.selectionId)
      : undefined
    if (request.selectionId && !selection) {
      throw new WorkspaceInputError("PLACE_SELECTION_INVALID")
    }
    const eventType = request.eventType ?? current.kind
    if (selection && selection.search.intent !== eventType) {
      throw new WorkspaceInputError("PLACE_SELECTION_TYPE_MISMATCH")
    }
    const order = this.currentItemOrder()
    const index = order.indexOf(request.itemKey)
    const afterItemKey = index > 0 ? order[index - 1] : null
    const activeSelection =
      selection ?? this.selectionFromCurrentEvent(current, eventType)
    const replacement = this.materializePlaceEvent({
      itemKey: request.itemKey,
      selection: activeSelection,
      eventType,
      afterItemKey,
      scheduleIntent: request.scheduleIntent,
      notes:
        request.notes === undefined
          ? current.description
          : (request.notes ?? undefined),
      keepSchedule: request.scheduleIntent ? undefined : current,
    })
    this.placeFacts.set(request.itemKey, {
      cityLabel: activeSelection.cityLabel,
      resolved: activeSelection.resolved,
    })
    const entry = this.append({
      type: "EVENT_REPLACED",
      itemKey: request.itemKey,
      event: replacement,
      reason: "semantic event update",
    })
    this.removeStaleDerivedEvents()
    return {
      acceptedSequence: entry.sequence,
      itemKey: request.itemKey,
      materializedEvent: replacement,
      nextAction: "COMPLETE_REQUIREMENTS_OR_VALIDATE" as const,
    }
  }

  moveEvent(request: EventMoveRequest) {
    const current = this.materializedEvent(request.itemKey)
    if (current.kind === "TRANSIT" || current.kind === "STAY") {
      throw new WorkspaceInputError("DERIVED_EVENT_MOVE_NOT_ALLOWED")
    }
    if (!this.placeFacts.has(request.itemKey)) {
      const selection = this.selectionFromCurrentEvent(current, current.kind)
      this.placeFacts.set(request.itemKey, {
        cityLabel: selection.cityLabel,
        resolved: selection.resolved,
      })
    }
    if (request.afterItemKey === request.itemKey) {
      throw new WorkspaceInputError("EVENT_MOVE_SELF_ANCHOR")
    }
    this.assertAnchor(request.afterItemKey, request.itemKey)
    const moved = request.scheduleIntent
      ? this.rescheduleExistingEvent(
          current,
          request.afterItemKey,
          request.scheduleIntent
        )
      : current
    this.append({
      type: "EVENT_REMOVED",
      itemKey: request.itemKey,
      reason: "event move",
    })
    const entry = this.append({
      type: "EVENT_APPENDED",
      event: moved,
      afterItemKey: request.afterItemKey,
      reason: "event move",
    })
    this.removeStaleDerivedEvents()
    return {
      acceptedSequence: entry.sequence,
      itemKey: request.itemKey,
      materializedEvent: moved,
      nextAction: "COMPLETE_REQUIREMENTS_OR_VALIDATE" as const,
    }
  }

  removeEvent(request: EventRemoveRequest) {
    this.assertKnownItem(request.itemKey)
    const entry = this.append({
      type: "EVENT_REMOVED",
      itemKey: request.itemKey,
      reason: request.reason,
    })
    this.removeStaleDerivedEvents()
    return {
      acceptedSequence: entry.sequence,
      removedItemKey: request.itemKey,
      nextAction: "COMPLETE_REQUIREMENTS_OR_VALIDATE" as const,
    }
  }

  private assertKnownItem(itemKey: string) {
    if (!this.currentItemOrder().includes(itemKey)) {
      throw new WorkspaceInputError(`Unknown proposal item ${itemKey}`)
    }
  }

  private currentItemOrder() {
    const order = this.baseline.journey.events.map(
      (event) => event.proposalItemKey
    )
    const insertAfter = (itemKey: string, afterItemKey: string | null) => {
      if (afterItemKey === null) {
        order.unshift(itemKey)
        return
      }
      const anchorIndex = order.indexOf(afterItemKey)
      if (anchorIndex >= 0) order.splice(anchorIndex + 1, 0, itemKey)
    }
    for (const entry of this.semanticEntries()) {
      if (entry.type === "EVENT_APPENDED") {
        insertAfter(entry.event.proposalItemKey, entry.afterItemKey)
        continue
      }
      const index = order.indexOf(entry.itemKey)
      if (index < 0) continue
      if (entry.type === "EVENT_REMOVED") {
        order.splice(index, 1)
        continue
      }
      order.splice(index, 1, entry.event.proposalItemKey)
    }
    return order
  }

  private selectionId(type: "place" | "hotel" | "route", value: unknown) {
    return `${type}-${createHash("sha256")
      .update(`${this.runId}:${JSON.stringify(value)}`)
      .digest("hex")
      .slice(0, 24)}`
  }

  private itemKey(type: "place" | "stay" | "route", selectionId: string) {
    return `${type}-${createHash("sha256")
      .update(`${this.runId}:${selectionId}:${this.entries.length}`)
      .digest("hex")
      .slice(0, 16)}`
  }

  private assertAnchor(afterItemKey: string | null, excluding?: string) {
    if (afterItemKey === null) return
    if (
      afterItemKey === excluding ||
      !this.currentItemOrder().includes(afterItemKey)
    ) {
      throw new WorkspaceInputError(`Unknown order anchor ${afterItemKey}`)
    }
  }

  private baselineEvent(
    event: PlannerBaseline["journey"]["events"][number]
  ): MaterializedPathEvent {
    if (event.kind === "TRANSIT") {
      return {
        proposalItemKey: event.proposalItemKey,
        kind: "TRANSIT" as const,
        title: event.title,
        fromItemKey: event.fromItemKey ?? "missing-from",
        toItemKey: event.toItemKey ?? "missing-to",
        transportMode: this.transportModeForPlan(event.transportMode),
        ...(event.plannedStartAt
          ? { plannedStartAt: event.plannedStartAt }
          : {}),
        ...(event.plannedEndAt ? { plannedEndAt: event.plannedEndAt } : {}),
      }
    }
    return {
      proposalItemKey: event.proposalItemKey,
      kind: event.kind,
      title: event.title,
      cityQuery: event.city ?? "未标注城市",
      plannedStartAt:
        event.plannedStartAt ?? `${this.defaultTripStartDate}T09:00:00+08:00`,
      ...(event.plannedEndAt ? { plannedEndAt: event.plannedEndAt } : {}),
    } as MaterializedPathEvent
  }

  private materializedEventMap() {
    const events = new Map<string, MaterializedPathEvent>(
      this.baseline.journey.events.map((event) => [
        event.proposalItemKey,
        this.baselineEvent(event),
      ])
    )
    for (const entry of this.semanticEntries()) {
      if (entry.type === "EVENT_REMOVED") {
        events.delete(entry.itemKey)
        continue
      }
      if (entry.type === "EVENT_REPLACED") events.delete(entry.itemKey)
      events.set(entry.event.proposalItemKey, entry.event)
    }
    return events
  }

  private materializedEvents() {
    const byKey = this.materializedEventMap()
    return this.currentItemOrder().flatMap((itemKey) => {
      const event = byKey.get(itemKey)
      return event ? [event] : []
    })
  }

  private materializedEvent(itemKey: string) {
    const event = this.materializedEventMap().get(itemKey)
    if (!event)
      throw new WorkspaceInputError(`Unknown proposal item ${itemKey}`)
    return event
  }

  private selectionFromCurrentEvent(
    event: Exclude<MaterializedPathEvent, { kind: "TRANSIT" | "STAY" }>,
    eventType: "VISIT" | "MEAL" | "ACTIVITY"
  ) {
    const fact = this.placeFacts.get(event.proposalItemKey)
    if (fact) {
      return {
        search: {
          type: "place.search" as const,
          city: fact.cityLabel,
          query: fact.resolved.placeRef.canonicalName,
          intent: eventType,
        },
        cityLabel: fact.cityLabel,
        resolved: fact.resolved,
      }
    }
    const baseline = this.baseline.journey.events.find(
      (candidate) => candidate.proposalItemKey === event.proposalItemKey
    )
    if (!baseline || baseline.kind === "TRANSIT" || !baseline.place) {
      throw new WorkspaceInputError("EVENT_PLACE_FACT_UNAVAILABLE")
    }
    const provider = baseline.place.providerPlaceId
      ? ("amap" as const)
      : ("periplus" as const)
    const place = {
      id: `baseline:${event.proposalItemKey}`,
      name: baseline.place.name,
      normalizedName: baseline.place.name,
      aliases: [],
      category:
        eventType === "MEAL"
          ? ("RESTAURANT" as const)
          : eventType === "ACTIVITY"
            ? ("ENTERTAINMENT" as const)
            : ("SIGHT" as const),
      city: baseline.city,
      coordinates: [
        {
          provider,
          coordinateSystem: baseline.place.coordinateSystem as
            | "WGS84"
            | "GCJ02"
            | "BD09LL",
          lat: baseline.place.lat,
          lng: baseline.place.lng,
          source: "catalog" as const,
        },
      ],
      bestCoordinate: {
        provider,
        coordinateSystem: baseline.place.coordinateSystem as
          | "WGS84"
          | "GCJ02"
          | "BD09LL",
        lat: baseline.place.lat,
        lng: baseline.place.lng,
        source: "catalog" as const,
      },
      sources: [
        {
          provider,
          ...(baseline.place.providerPlaceId
            ? { providerId: baseline.place.providerPlaceId }
            : {}),
        },
      ],
      confidence: 1,
      quality: "verified" as const,
      canAddToJourney: true,
      needsUserConfirmation: false,
      reason: "committed baseline",
    }
    const resolved: Extract<PlaceResolveResult, { status: "resolved" }> = {
      status: "resolved",
      place,
      placeRef: placeRefFromResult(place, [place]),
      warnings: [],
    }
    return {
      search: {
        type: "place.search" as const,
        city: baseline.city ?? "未标注城市",
        query: baseline.place.name,
        intent: eventType,
      },
      cityLabel: baseline.city ?? "未标注城市",
      resolved,
    }
  }

  private materializePlaceEvent(input: {
    itemKey: string
    selection: {
      cityLabel: string
      resolved: Extract<PlaceResolveResult, { status: "resolved" }>
    }
    eventType: "VISIT" | "MEAL" | "ACTIVITY"
    afterItemKey: string | null
    scheduleIntent?: ScheduleIntent
    notes?: string
    keepSchedule?: MaterializedPathEvent
  }): MaterializedPathEvent {
    const schedule = input.keepSchedule
      ? {
          plannedStartAt: input.keepSchedule.plannedStartAt,
          plannedEndAt: input.keepSchedule.plannedEndAt,
        }
      : this.materializeSchedule(
          input.eventType,
          input.afterItemKey,
          input.scheduleIntent
        )
    return {
      proposalItemKey: input.itemKey,
      kind: input.eventType,
      title: input.selection.resolved.placeRef.canonicalName,
      cityQuery: input.selection.cityLabel,
      plannedStartAt:
        schedule.plannedStartAt ??
        `${this.defaultTripStartDate}T09:00:00+08:00`,
      ...(schedule.plannedEndAt ? { plannedEndAt: schedule.plannedEndAt } : {}),
      plannedDurationMinutes:
        input.scheduleIntent?.durationMinutes ??
        DEFAULT_DURATION_MINUTES[input.eventType],
      description: input.notes,
    } as MaterializedPathEvent
  }

  private rescheduleExistingEvent(
    event: Exclude<MaterializedPathEvent, { kind: "TRANSIT" | "STAY" }>,
    afterItemKey: string | null,
    intent: ScheduleIntent
  ) {
    const schedule = this.materializeSchedule(event.kind, afterItemKey, intent)
    return {
      ...event,
      plannedStartAt: schedule.plannedStartAt,
      plannedEndAt: schedule.plannedEndAt,
      plannedDurationMinutes:
        intent.durationMinutes ?? event.plannedDurationMinutes,
    }
  }

  private materializeSchedule(
    eventType: "VISIT" | "MEAL" | "ACTIVITY",
    afterItemKey: string | null,
    intent: ScheduleIntent = {}
  ) {
    const anchor = afterItemKey ? this.materializedEvent(afterItemKey) : null
    const date =
      intent.localDate ??
      (intent.dayIndex
        ? this.addDays(this.defaultTripStartDate, intent.dayIndex - 1)
        : (anchor?.plannedEndAt?.slice(0, 10) ?? this.defaultTripStartDate))
    const windowStart =
      intent.notBeforeLocalTime ??
      (intent.timeWindow === "AFTERNOON"
        ? "14:00"
        : intent.timeWindow === "EVENING"
          ? "18:00"
          : "09:00")
    let startMs = Date.parse(`${date}T${windowStart}:00+08:00`)
    const anchorEnd = anchor?.plannedEndAt ?? anchor?.plannedStartAt
    if (anchorEnd && anchorEnd.slice(0, 10) === date) {
      startMs = Math.max(startMs, Date.parse(anchorEnd))
    }
    const duration =
      intent.durationMinutes ?? DEFAULT_DURATION_MINUTES[eventType]
    const endMs = startMs + duration * 60_000
    if (intent.notAfterLocalTime) {
      const deadline = Date.parse(
        `${date}T${intent.notAfterLocalTime}:00+08:00`
      )
      if (endMs > deadline) throw new WorkspaceInputError("SCHEDULE_CONFLICT")
    }
    return {
      plannedStartAt: new Date(startMs).toISOString(),
      plannedEndAt: new Date(endMs).toISOString(),
    }
  }

  private addDays(date: string, days: number) {
    const value = new Date(`${date}T00:00:00Z`)
    value.setUTCDate(value.getUTCDate() + days)
    return value.toISOString().slice(0, 10)
  }

  private transportModeForPlan(
    value: string | undefined
  ):
    | "FLIGHT"
    | "TRAIN"
    | "CAR"
    | "BUS"
    | "WALK"
    | "TAXI"
    | "SUBWAY"
    | "RENTAL" {
    if (
      value === "WALK" ||
      value === "BUS" ||
      value === "SUBWAY" ||
      value === "TRAIN" ||
      value === "CAR" ||
      value === "TAXI" ||
      value === "RENTAL"
    ) {
      return value
    }
    return value === "DRIVE" ? ("CAR" as const) : ("WALK" as const)
  }

  private shiftFlexibleSuffix(itemKey: string, earliestStartAt: string) {
    const events = this.materializedEvents()
    const startIndex = events.findIndex(
      (event) => event.proposalItemKey === itemKey
    )
    if (startIndex < 0) return
    const first = events[startIndex]
    if (!first?.plannedStartAt) return
    const delta = Date.parse(earliestStartAt) - Date.parse(first.plannedStartAt)
    if (delta <= 0) return
    const date = first.plannedStartAt.slice(0, 10)
    for (const event of events.slice(startIndex)) {
      if (!event.plannedStartAt || event.plannedStartAt.slice(0, 10) !== date) {
        break
      }
      const shifted: MaterializedPathEvent = {
        ...event,
        plannedStartAt: new Date(
          Date.parse(event.plannedStartAt) + delta
        ).toISOString(),
        ...(event.plannedEndAt
          ? {
              plannedEndAt: new Date(
                Date.parse(event.plannedEndAt) + delta
              ).toISOString(),
            }
          : {}),
      }
      this.append({
        type: "EVENT_REPLACED",
        itemKey: event.proposalItemKey,
        event: shifted,
        reason: "backend route schedule materialization",
      })
    }
  }

  private removeStaleDerivedEvents() {
    const events = this.materializedEvents()
    const nonTransit = events.filter((event) => event.kind !== "TRANSIT")
    const adjacent = new Set(
      nonTransit.slice(0, -1).map((event, index) => {
        const next = nonTransit[index + 1]
        return `${event.proposalItemKey}:${next?.proposalItemKey}`
      })
    )
    for (const event of events) {
      if (
        event.kind === "TRANSIT" &&
        !adjacent.has(`${event.fromItemKey}:${event.toItemKey}`)
      ) {
        this.append({
          type: "EVENT_REMOVED",
          itemKey: event.proposalItemKey,
          reason: "backend invalidated stale route adjacency",
        })
      }
    }
  }

  private requirements() {
    const events = this.materializedEvents()
    const nonTransit = events.filter((event) => event.kind !== "TRANSIT")
    const routeRequirements: RouteRequirement[] = []
    const stayRequirements: StayRequirement[] = []
    for (let index = 0; index < nonTransit.length - 1; index += 1) {
      const from = nonTransit[index]
      const to = nonTransit[index + 1]
      if (!from || !to) continue
      const fromIndex = events.findIndex(
        (event) => event.proposalItemKey === from.proposalItemKey
      )
      const toIndex = events.findIndex(
        (event) => event.proposalItemKey === to.proposalItemKey
      )
      const between = events.slice(fromIndex + 1, toIndex)
      const hasRoute = between.some(
        (event) =>
          event.kind === "TRANSIT" &&
          event.fromItemKey === from.proposalItemKey &&
          event.toItemKey === to.proposalItemKey
      )
      const departAt = from.plannedEndAt ?? from.plannedStartAt
      const arriveAt = to.plannedStartAt
      const departDate = departAt?.slice(0, 10)
      const arriveDate = arriveAt?.slice(0, 10)
      if (departAt && departDate === arriveDate && !hasRoute) {
        routeRequirements.push({
          routeRequirementId: this.selectionId("route", {
            from: from.proposalItemKey,
            to: to.proposalItemKey,
            departAt,
          }),
          fromItemKey: from.proposalItemKey,
          toItemKey: to.proposalItemKey,
          earliestDepartAt: departAt,
        })
      }
      if (
        from.kind !== "STAY" &&
        to.kind !== "STAY" &&
        "cityQuery" in from &&
        "cityQuery" in to &&
        from.cityQuery === to.cityQuery &&
        departDate &&
        arriveDate &&
        arriveDate > departDate
      ) {
        const nights = Math.max(
          1,
          Math.round(
            (Date.parse(`${arriveDate}T00:00:00Z`) -
              Date.parse(`${departDate}T00:00:00Z`)) /
              DAY_MS
          )
        )
        stayRequirements.push({
          stayRequirementId: this.selectionId("hotel", {
            city: from.cityQuery,
            checkInDate: departDate,
            checkOutDate: arriveDate,
            from: from.proposalItemKey,
            to: to.proposalItemKey,
          }),
          cityLabel: from.cityQuery,
          checkInDate: departDate,
          checkOutDate: arriveDate,
          nights,
          anchorItemKeys: [from.proposalItemKey, to.proposalItemKey],
        })
      }
    }
    return { routeRequirements, stayRequirements }
  }

  private cityLabelKey(value: string) {
    return value.trim().replace(/\s+/gu, " ").toLocaleLowerCase()
  }

  private locationForEvent(
    event: Exclude<MaterializedPathEvent, { kind: "TRANSIT" }>
  ): PlaceRef {
    const place = this.placeFacts.get(event.proposalItemKey)?.resolved.placeRef
    if (place) return place
    const hotel = this.hotelFacts.get(event.proposalItemKey)?.candidate
    if (hotel) {
      return {
        provider: "rollinggo",
        providerId: hotel.providerHotelId,
        canonicalName: hotel.name,
        city: event.cityQuery,
        address: hotel.address,
        lat: hotel.coordinates.lat,
        lng: hotel.coordinates.lng,
        coordinateSystem: "WGS84",
        confidence: 1,
        candidates: [],
      }
    }
    const baseline = this.baseline.journey.events.find(
      (candidate) => candidate.proposalItemKey === event.proposalItemKey
    )
    if (baseline?.kind !== "TRANSIT" && baseline?.place) {
      return {
        provider: baseline.place.providerPlaceId ? "amap" : "periplus",
        providerId: baseline.place.providerPlaceId,
        canonicalName: baseline.place.name,
        city: baseline.city,
        lat: baseline.place.lat,
        lng: baseline.place.lng,
        coordinateSystem: baseline.place.coordinateSystem as
          | "WGS84"
          | "GCJ02"
          | "BD09LL",
        confidence: 1,
        candidates: [],
      }
    }
    throw new WorkspaceInputError(
      `Missing provider location for ${event.proposalItemKey}`
    )
  }

  private semanticEntries() {
    return this.entries.filter(
      (entry) =>
        entry.type === "EVENT_APPENDED" ||
        entry.type === "EVENT_REPLACED" ||
        entry.type === "EVENT_REMOVED"
    )
  }

  private async fold(toolCallId: string): Promise<FoldResult> {
    const draft = new AgentDraftSession(
      this.workspaceId,
      this.runId,
      this.authContext,
      this.commands,
      this.baseline.workspaceRevision
    )
    await draft.openCurrent(`${toolCallId}:open`)
    const graph = draft.currentGraph()
    const flat = projectFlatJourney(graph, this.baseline.workspaceRevision)
    const itemToCardId = new Map(
      flat.events.map((event, index) => [baselineItemKey(index), event.eventId])
    )
    const transitItemToCardId = new Map<string, string>()
    const logicalOrder = this.baseline.journey.events.map(
      (event) => event.proposalItemKey
    )

    const cityForItem = (itemKey: string) => {
      const eventId = itemToCardId.get(itemKey)
      const event = eventId
        ? draft
            .currentGraph()
            .events.find((candidate) => candidate.id === eventId)
        : undefined
      if (!event?.parentSectionEventId) return undefined
      const city = draft
        .currentGraph()
        .events.find(
          (candidate) =>
            candidate.id === event.parentSectionEventId &&
            candidate.type === "SECTION" &&
            candidate.detail.kind === "CITY"
        )
      return city?.type === "SECTION" ? city : undefined
    }

    const ensureCity = async (
      event: Exclude<MaterializedPathEvent, { kind: "TRANSIT" }>,
      afterItemKey: string | null,
      suffix: string,
      preferredCityCardId?: string
    ) => {
      const normalized = this.cityLabelKey(event.cityQuery)
      const preferredCity = preferredCityCardId
        ? draft
            .currentGraph()
            .events.find(
              (candidate) =>
                candidate.id === preferredCityCardId &&
                candidate.type === "SECTION" &&
                candidate.detail.kind === "CITY"
            )
        : undefined
      if (
        preferredCity?.type === "SECTION" &&
        this.cityLabelKey(preferredCity.title) === normalized
      ) {
        return preferredCity.id
      }
      const anchorIndex =
        afterItemKey === null ? -1 : logicalOrder.indexOf(afterItemKey)
      const leftKeys = logicalOrder.slice(0, anchorIndex + 1).reverse()
      const rightKeys = logicalOrder.slice(anchorIndex + 1)
      const leftCities = leftKeys.flatMap((itemKey) => {
        const city = cityForItem(itemKey)
        return city ? [city] : []
      })
      const rightCities = rightKeys.flatMap((itemKey) => {
        const city = cityForItem(itemKey)
        return city ? [city] : []
      })
      const existing = [
        ...leftCities.slice(0, 1),
        ...rightCities.slice(0, 1),
      ].find((city) => this.cityLabelKey(city.title) === normalized)
      if (existing) return existing.id
      const previousCity = leftCities[0]
      const result = await draft.addCity(
        {
          type: "city.add",
          name: event.cityQuery,
          afterCardId: previousCity?.id ?? null,
        },
        `${toolCallId}:city:${suffix}`,
        this.locationForEvent(event)
      )
      const current = draft.currentGraph()
      const added = result.changedCardIds
        .map((id) => current.events.find((event) => event.id === id))
        .find((event) => event?.type === "SECTION")
      if (!added) throw new WorkspaceInputError("City card was not created")
      return added.id
    }

    const insertOrder = (itemKey: string, afterItemKey: string | null) => {
      const existingIndex = logicalOrder.indexOf(itemKey)
      if (existingIndex >= 0) logicalOrder.splice(existingIndex, 1)
      if (afterItemKey === null) {
        logicalOrder.unshift(itemKey)
        return
      }
      const anchorIndex = logicalOrder.indexOf(afterItemKey)
      if (anchorIndex < 0) {
        throw new WorkspaceInputError(`Unknown order anchor ${afterItemKey}`)
      }
      logicalOrder.splice(anchorIndex + 1, 0, itemKey)
    }

    const addEvent = async (
      event: MaterializedPathEvent,
      afterItemKey: string | null,
      suffix: string,
      preferredCityCardId?: string
    ) => {
      if (event.kind === "TRANSIT") {
        const fromCardId = itemToCardId.get(event.fromItemKey)
        const toCardId = itemToCardId.get(event.toItemKey)
        if (!fromCardId || !toCardId) {
          throw new WorkspaceInputError(
            `Transit endpoints are not materialized for ${event.proposalItemKey}`
          )
        }
        const current = draft.currentGraph()
        const from = current.events.find(
          (candidate) => candidate.id === fromCardId
        )
        const to = current.events.find((candidate) => candidate.id === toCardId)
        if (!from || !to) {
          throw new WorkspaceInputError(
            `Transit endpoints are missing for ${event.proposalItemKey}`
          )
        }
        const sameCity =
          from.parentSectionEventId !== null &&
          from.parentSectionEventId === to.parentSectionEventId
        const compiledFromCardId = sameCity
          ? from.id
          : from.parentSectionEventId
        const compiledToCardId = sameCity ? to.id : to.parentSectionEventId
        if (!compiledFromCardId || !compiledToCardId) {
          throw new WorkspaceInputError(
            `Cross-City Transit endpoints require City segments for ${event.proposalItemKey}`
          )
        }
        const result = await draft.addTransit(
          {
            type: "transit.add",
            fromCardId: compiledFromCardId,
            toCardId: compiledToCardId,
            plannedStartAt:
              event.plannedStartAt ??
              (from.type === "SECTION" || from.type === "NOTE"
                ? undefined
                : (from.plannedEndAt ?? from.plannedStartAt)),
            plannedEndAt: event.plannedEndAt,
            modePreference: event.transportMode,
            routePreference: event.preference,
            title: event.title,
            description: event.description,
            notes: event.notes,
          },
          `${toolCallId}:transit:${suffix}`
        )
        const afterTransit = draft.currentGraph()
        const added = result.changedCardIds
          .map((id) =>
            afterTransit.events.find((candidate) => candidate.id === id)
          )
          .find((candidate) => candidate?.type === "TRANSIT")
        if (!added)
          throw new WorkspaceInputError("Transit card was not created")
        itemToCardId.set(event.proposalItemKey, added.id)
        transitItemToCardId.set(event.proposalItemKey, added.id)
        insertOrder(event.proposalItemKey, event.fromItemKey)
        return
      }
      const cityCardId = await ensureCity(
        event,
        afterItemKey,
        suffix,
        preferredCityCardId
      )
      const requestedAnchorCardId = afterItemKey
        ? itemToCardId.get(afterItemKey)
        : undefined
      const requestedAnchor = requestedAnchorCardId
        ? draft
            .currentGraph()
            .events.find((candidate) => candidate.id === requestedAnchorCardId)
        : undefined
      const anchorCardId =
        requestedAnchor?.parentSectionEventId === cityCardId
          ? requestedAnchor.id
          : undefined
      if (event.kind === "STAY") {
        const fact = this.hotelFacts.get(event.proposalItemKey)
        if (!fact) throw new WorkspaceInputError("Missing hotel fact")
        const selectionId = draft.registerHotelSelection(
          fact.candidate,
          fact.warnings,
          cityCardId,
          {
            plannedStartAt: event.plannedStartAt,
            plannedEndAt:
              event.plannedEndAt ??
              new Date(Date.parse(event.plannedStartAt) + DAY_MS).toISOString(),
          }
        )
        const result = await draft.addStay(
          {
            type: "stay.add",
            cityCardId,
            hotelSelectionId: selectionId,
            description: event.description,
            checkInNote: event.checkInNote,
            afterCardId: anchorCardId,
          },
          `${toolCallId}:stay:${suffix}`
        )
        const current = draft.currentGraph()
        const added = result.changedCardIds
          .map((id) => current.events.find((candidate) => candidate.id === id))
          .find((candidate) => candidate?.type === "STAY")
        if (!added) throw new WorkspaceInputError("Stay card was not created")
        itemToCardId.set(event.proposalItemKey, added.id)
      } else {
        const fact = this.placeFacts.get(event.proposalItemKey)
        if (!fact) throw new WorkspaceInputError("Missing place fact")
        const placeResolutionId = draft.registerResolvedPlace(fact.resolved)
        const result = await draft.addPlaceEvent(
          {
            type: "placeEvent.add",
            cityCardId,
            cardType: event.kind,
            placeResolutionId,
            plannedStartAt: event.plannedStartAt,
            plannedEndAt: event.plannedEndAt,
            plannedDurationMinutes: event.plannedDurationMinutes,
            description: event.description,
            ...(event.kind === "MEAL" ? { cuisine: event.cuisine } : {}),
            ...(event.kind === "ACTIVITY"
              ? { bookingReference: event.bookingReference }
              : {}),
            afterCardId: anchorCardId,
          },
          `${toolCallId}:place:${suffix}`
        )
        const current = draft.currentGraph()
        const added = result.changedCardIds
          .map((id) => current.events.find((candidate) => candidate.id === id))
          .find((candidate) => candidate?.type === event.kind)
        if (!added) throw new WorkspaceInputError("Place card was not created")
        itemToCardId.set(event.proposalItemKey, added.id)
      }
      insertOrder(event.proposalItemKey, afterItemKey)
    }

    for (const [index, entry] of this.semanticEntries().entries()) {
      if (entry.type === "EVENT_APPENDED") {
        await addEvent(entry.event, entry.afterItemKey, `${index}:append`)
        continue
      }
      const currentCardId = itemToCardId.get(entry.itemKey)
      if (!currentCardId) {
        throw new WorkspaceInputError(`Unknown path item ${entry.itemKey}`)
      }
      if (entry.type === "EVENT_REMOVED") {
        await draft.removeCard(
          { type: "card.remove", cardId: currentCardId },
          `${toolCallId}:${index}:remove`
        )
        itemToCardId.delete(entry.itemKey)
        const orderIndex = logicalOrder.indexOf(entry.itemKey)
        if (orderIndex >= 0) logicalOrder.splice(orderIndex, 1)
        continue
      }
      const orderIndex = logicalOrder.indexOf(entry.itemKey)
      const previousKey = orderIndex > 0 ? logicalOrder[orderIndex - 1] : null
      const currentCard = draft
        .currentGraph()
        .events.find((candidate) => candidate.id === currentCardId)
      const preferredCityCardId =
        entry.event.kind !== "TRANSIT" &&
        currentCard?.parentSectionEventId &&
        currentCard.type !== "TRANSIT"
          ? currentCard.parentSectionEventId
          : undefined
      await draft.removeCard(
        { type: "card.remove", cardId: currentCardId },
        `${toolCallId}:${index}:replace-remove`
      )
      itemToCardId.delete(entry.itemKey)
      if (orderIndex >= 0) logicalOrder.splice(orderIndex, 1)
      await addEvent(
        entry.event,
        previousKey,
        `${index}:replace-add`,
        preferredCityCardId
      )
    }
    return { draft, itemToCardId, transitItemToCardId }
  }

  async validate(toolCallId: string) {
    const requirements = this.requirements()
    if (
      requirements.routeRequirements.length ||
      requirements.stayRequirements.length
    ) {
      return {
        valid: false,
        issues: [
          ...requirements.routeRequirements.map((requirement) => ({
            code: "ROUTE_REQUIREMENT_PENDING",
            severity: "ERROR" as const,
            message: `Route selection is required from ${requirement.fromItemKey} to ${requirement.toItemKey}`,
          })),
          ...requirements.stayRequirements.map((requirement) => ({
            code: "STAY_REQUIREMENT_PENDING",
            severity: "ERROR" as const,
            message: `Hotel selection is required for ${requirement.checkInDate}`,
          })),
        ],
        nextAction: "REVISE" as const,
        remainingRevisions: Math.max(
          0,
          MAX_PATH_VALIDATIONS - this.validationCount
        ),
      }
    }
    if (this.validationCount >= MAX_PATH_VALIDATIONS) {
      throw new WorkspaceInputError("PATH_REVISION_LIMIT_EXHAUSTED")
    }
    this.validationCount += 1
    const folded = await this.fold(toolCallId)
    let validation = await folded.draft.validateCurrent(
      `${toolCallId}:validate`
    )
    const transitIssues = validation.validation.issues.filter(
      (issue) => issue.code === "TRANSIT_ROUTE_NOT_READY"
    )
    const nonTransitErrors = validation.validation.issues.filter(
      (issue) =>
        issue.severity === "ERROR" && issue.code !== "TRANSIT_ROUTE_NOT_READY"
    )
    if (!nonTransitErrors.length && transitIssues.length) {
      for (const issue of transitIssues) {
        const transitCardId = issue.cardIds.find((cardId) =>
          [...folded.transitItemToCardId.values()].includes(cardId)
        )
        if (transitCardId) {
          const proposalItemKey = [...folded.transitItemToCardId].find(
            ([, cardId]) => cardId === transitCardId
          )?.[0]
          const resolvedRoute = proposalItemKey
            ? this.routeFacts.get(proposalItemKey)?.bundle
            : undefined
          if (!resolvedRoute) {
            throw new WorkspaceInputError(
              `Missing resolved route for ${proposalItemKey ?? transitCardId}`
            )
          }
          await folded.draft.prepareTransitCurrent(
            transitCardId,
            `${toolCallId}:route:${transitCardId}`,
            { ...resolvedRoute, transitEventId: transitCardId }
          )
        }
      }
      validation = await folded.draft.validateCurrent(
        `${toolCallId}:validate-routes`
      )
    }
    this.append({
      type: "VALIDATION_RESULT",
      valid: validation.validation.valid,
      issueCodes: validation.validation.issues.map((issue) => issue.code),
    })
    this.validated = {
      ...folded,
      logSequence: this.semanticEntries().at(-1)?.sequence ?? 0,
      validation,
    }
    return {
      valid: validation.validation.valid,
      issues: validation.validation.issues.map((issue) => ({
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
      })),
      nextAction: validation.validation.valid
        ? ("COMMIT" as const)
        : this.validationCount >= MAX_PATH_VALIDATIONS
          ? ("TERMINAL" as const)
          : ("REVISE" as const),
      remainingRevisions: Math.max(
        0,
        MAX_PATH_VALIDATIONS - this.validationCount
      ),
    }
  }

  async commit(toolCallId: string) {
    if (
      !this.validated ||
      !this.validated.validation.validation.valid ||
      this.validated.logSequence !==
        (this.semanticEntries().at(-1)?.sequence ?? 0)
    ) {
      throw new WorkspaceInputError(
        "path.commit requires the latest ChangeLog fold to be VALID"
      )
    }
    const committed = await this.validated.draft.commitCurrent(toolCallId)
    const keys = changedEventKeys(this.entries)
    const committedFlat = projectFlatJourney(
      this.validated.draft.currentGraph(),
      committed.newWorkspaceRevision
    )
    const activeEventIds = new Set(
      committedFlat.events.map((event) => event.eventId)
    )
    const changedEventIds = committed.changedCardIds.filter((eventId) =>
      activeEventIds.has(eventId)
    )
    this.clear()
    return {
      newWorkspaceRevision: committed.newWorkspaceRevision,
      projectionHash: committed.projectionHash,
      summary: keys.length
        ? `已更新 ${keys.length} 个行程事件`
        : "行程未发生变化",
      changedEventIds,
    }
  }

  latestStateDelta() {
    return this.entries.at(-1) ?? null
  }

  planningState() {
    const materializedPath = this.materializedEvents().map((event) => ({
      itemKey: event.proposalItemKey,
      kind: event.kind,
      title: event.title,
      ...(event.kind === "TRANSIT"
        ? {
            fromItemKey: event.fromItemKey,
            toItemKey: event.toItemKey,
            transportMode: event.transportMode,
          }
        : { cityLabel: event.cityQuery }),
      ...(event.plannedStartAt ? { plannedStartAt: event.plannedStartAt } : {}),
      ...(event.plannedEndAt ? { plannedEndAt: event.plannedEndAt } : {}),
    }))
    const requirements = this.requirements()

    const unresolvedByKey = new Map<
      string,
      { proposalItemKey: string; code: string; message: string }
    >()
    for (const entry of this.entries) {
      if (entry.type === "FACT_RESOLVED") {
        unresolvedByKey.delete(`${entry.subject}:${entry.proposalItemKey}`)
        continue
      }
      if (entry.type === "FACT_REJECTED") {
        unresolvedByKey.set(`${entry.subject}:${entry.proposalItemKey}`, {
          proposalItemKey: entry.proposalItemKey,
          code: entry.code,
          message: entry.message,
        })
        continue
      }
      if (entry.type === "TOOL_REJECTED") {
        unresolvedByKey.set(`TOOL:${entry.tool}`, {
          proposalItemKey: entry.tool,
          code: entry.code,
          message: entry.message,
        })
      }
    }

    const latestValidation = [...this.entries]
      .reverse()
      .find((entry) => entry.type === "VALIDATION_RESULT")
    const latestMutation = [...this.entries]
      .reverse()
      .find(
        (entry) =>
          entry.type === "EVENT_APPENDED" ||
          entry.type === "EVENT_REPLACED" ||
          entry.type === "EVENT_REMOVED"
      )
    const validationState =
      latestValidation &&
      (!latestMutation || latestValidation.sequence > latestMutation.sequence)
        ? latestValidation.valid
          ? ("VALID" as const)
          : ("INVALID" as const)
        : ("NOT_RUN" as const)

    return {
      sequence: this.entries.at(-1)?.sequence ?? 0,
      baseRevision: this.baseline.workspaceRevision,
      materializedPath,
      requirements,
      conflicts: [],
      warnings: [],
      unresolved: [...unresolvedByKey.values()],
      latestValidation: validationState,
      semanticRevisionRemaining: Math.max(
        0,
        MAX_PATH_VALIDATIONS - this.validationCount
      ),
    }
  }

  changeLogContext() {
    return this.entries.slice()
  }

  clear() {
    this.entries.length = 0
    this.placeSelections.clear()
    this.hotelSelections.clear()
    this.routeSelections.clear()
    this.placeFacts.clear()
    this.hotelFacts.clear()
    this.routeFacts.clear()
    this.validated = null
    this.validationCount = 0
  }

  fingerprint() {
    return createHash("sha256")
      .update(JSON.stringify(this.changeLogContext()))
      .digest("hex")
  }
}
