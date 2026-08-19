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
import {
  dateTimeFromTimestamp,
  dateTimeToTimestamp,
} from "@/modules/data-model/contracts"
import { projectFlatJourney } from "@/modules/data/journeys/flat-journey-projection"
import type { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"
import { WorkspaceInputError } from "@/modules/data/workspaces/workspace-repository"
import { AgentDraftSession } from "./draft-session"
import type { PlannerBaseline } from "./planner-baseline"
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

interface CompiledDraft {
  draft: AgentDraftSession
  itemToCardId: Map<string, string>
  transitItemToCardId: Map<string, string>
}

const MAX_CHANGE_LOG_ENTRIES = 256
const DAY_MS = 86_400_000
const PLANNING_TIME_ZONE = "Asia/Shanghai"
const DEFAULT_DURATION_MINUTES = {
  VISIT: 120,
  MEAL: 90,
  ACTIVITY: 120,
} as const

function planningLocalDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: PLANNING_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(dateTimeToTimestamp(value)))
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )
  return `${values.year}-${values.month}-${values.day}`
}

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
      const startAt = dateTimeFromTimestamp(
        `${requirement.checkInDate}T22:00:00+08:00`
      )
      const endAt = dateTimeFromTimestamp(
        `${requirement.checkOutDate}T08:00:00+08:00`
      )
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
      this.removeStaleDerivedEvents()
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
    const startAt = dateTimeFromTimestamp(requirement.earliestDepartAt)
    const endAt = dateTimeFromTimestamp(
      dateTimeToTimestamp(startAt) + plan.durationSeconds * 1000
    )
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
      nextAction: "COMPLETE_REQUIREMENTS_OR_COMMIT" as const,
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
      nextAction: "COMPLETE_REQUIREMENTS_OR_COMMIT" as const,
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
      nextAction: "COMPLETE_REQUIREMENTS_OR_COMMIT" as const,
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
        ...(event.description ? { description: event.description } : {}),
        fromItemKey: event.fromItemKey ?? "missing-from",
        toItemKey: event.toItemKey ?? "missing-to",
        transportMode: this.transportModeForPlan(event.transportMode),
        ...(event.preference
          ? {
              preference: event.preference as NonNullable<
                Extract<
                  MaterializedPathEvent,
                  { kind: "TRANSIT" }
                >["preference"]
              >,
            }
          : {}),
        ...(event.plannedStartAt
          ? { plannedStartAt: dateTimeFromTimestamp(event.plannedStartAt) }
          : {}),
        ...(event.plannedEndAt
          ? { plannedEndAt: dateTimeFromTimestamp(event.plannedEndAt) }
          : {}),
      }
    }
    return {
      proposalItemKey: event.proposalItemKey,
      kind: event.kind,
      title: event.title,
      ...(event.description ? { description: event.description } : {}),
      cityQuery: event.city ?? "未标注城市",
      plannedStartAt: dateTimeFromTimestamp(
        event.plannedStartAt ?? `${this.defaultTripStartDate}T09:00:00+08:00`
      ),
      ...(event.plannedEndAt
        ? { plannedEndAt: dateTimeFromTimestamp(event.plannedEndAt) }
        : {}),
      ...(event.plannedDurationMinutes === undefined
        ? {}
        : { plannedDurationMinutes: event.plannedDurationMinutes }),
      ...(event.kind === "MEAL" && event.cuisine
        ? { cuisine: event.cuisine }
        : {}),
      ...(event.kind === "ACTIVITY" && event.bookingReference
        ? { bookingReference: event.bookingReference }
        : {}),
      ...(event.kind === "STAY" && event.checkInNote
        ? { checkInNote: event.checkInNote }
        : {}),
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
        dateTimeFromTimestamp(`${this.defaultTripStartDate}T09:00:00+08:00`),
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
        : anchor?.plannedEndAt
          ? planningLocalDate(anchor.plannedEndAt)
          : this.defaultTripStartDate)
    const windowStart =
      intent.notBeforeLocalTime ??
      (intent.timeWindow === "AFTERNOON"
        ? "14:00"
        : intent.timeWindow === "EVENING"
          ? "18:00"
          : "09:00")
    let startMs = dateTimeToTimestamp(`${date}T${windowStart}:00+08:00`)
    const anchorEnd = anchor?.plannedEndAt ?? anchor?.plannedStartAt
    if (anchorEnd && planningLocalDate(anchorEnd) === date) {
      startMs = Math.max(startMs, dateTimeToTimestamp(anchorEnd))
    }
    const duration =
      intent.durationMinutes ?? DEFAULT_DURATION_MINUTES[eventType]
    const endMs = startMs + duration * 60_000
    if (intent.notAfterLocalTime) {
      const deadline = dateTimeToTimestamp(
        `${date}T${intent.notAfterLocalTime}:00+08:00`
      )
      if (endMs > deadline) throw new WorkspaceInputError("SCHEDULE_CONFLICT")
    }
    return {
      plannedStartAt: dateTimeFromTimestamp(startMs),
      plannedEndAt: dateTimeFromTimestamp(endMs),
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
    const delta =
      dateTimeToTimestamp(earliestStartAt) -
      dateTimeToTimestamp(first.plannedStartAt)
    if (delta <= 0) return
    const date = planningLocalDate(first.plannedStartAt)
    for (const event of events.slice(startIndex)) {
      if (
        !event.plannedStartAt ||
        planningLocalDate(event.plannedStartAt) !== date
      ) {
        break
      }
      const shifted: MaterializedPathEvent = {
        ...event,
        plannedStartAt: dateTimeFromTimestamp(
          dateTimeToTimestamp(event.plannedStartAt) + delta
        ),
        ...(event.plannedEndAt
          ? {
              plannedEndAt: dateTimeFromTimestamp(
                dateTimeToTimestamp(event.plannedEndAt) + delta
              ),
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
    for (const event of this.staleTransitEvents()) {
      this.append({
        type: "EVENT_REMOVED",
        itemKey: event.proposalItemKey,
        reason: "backend invalidated stale route adjacency",
      })
    }
  }

  private staleTransitEvents() {
    const events = this.materializedEvents()
    const nonTransit = events.filter((event) => event.kind !== "TRANSIT")
    const adjacent = new Set(
      nonTransit.slice(0, -1).map((event, index) => {
        const next = nonTransit[index + 1]
        return `${event.proposalItemKey}:${next?.proposalItemKey}`
      })
    )
    return events.filter(
      (event): event is Extract<MaterializedPathEvent, { kind: "TRANSIT" }> =>
        event.kind === "TRANSIT" &&
        !adjacent.has(`${event.fromItemKey}:${event.toItemKey}`)
    )
  }

  private staleTransitIssues() {
    return this.staleTransitEvents().map((event) => ({
      code: "STALE_TRANSIT_ADJACENCY",
      severity: "ERROR" as const,
      message: `Transit ${event.proposalItemKey} endpoints ${event.fromItemKey} and ${event.toItemKey} are not adjacent in the current Path`,
      proposalItemKey: event.proposalItemKey,
      fromItemKey: event.fromItemKey,
      toItemKey: event.toItemKey,
    }))
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
      const departDate = departAt ? planningLocalDate(departAt) : undefined
      const arriveDate = arriveAt ? planningLocalDate(arriveAt) : undefined
      if (departAt && !hasRoute) {
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
            (dateTimeToTimestamp(`${arriveDate}T00:00:00Z`) -
              dateTimeToTimestamp(`${departDate}T00:00:00Z`)) /
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

  private baselineHotelFact(
    event: Extract<MaterializedPathEvent, { kind: "STAY" }>
  ): HotelFact {
    const baseline = this.baseline.journey.events.find(
      (candidate) => candidate.proposalItemKey === event.proposalItemKey
    )
    const graphEvent = baseline
      ? this.baseline.graph.events.find(
          (candidate) => candidate.id === baseline.eventId
        )
      : undefined
    if (!baseline?.place || !graphEvent || graphEvent.type !== "STAY") {
      throw new WorkspaceInputError(
        `Missing hotel fact for ${event.proposalItemKey}`
      )
    }
    const offer = graphEvent.detail.hotelOffer
    return {
      cityLabel: event.cityQuery,
      candidate: {
        candidateId: `baseline:${event.proposalItemKey}`,
        provider: "rollinggo",
        providerHotelId:
          offer?.providerHotelId ??
          graphEvent.detail.providerPlaceId ??
          graphEvent.id,
        name: event.title,
        ...(offer?.address ? { address: offer.address } : {}),
        coordinates: {
          lat: baseline.place.lat,
          lng: baseline.place.lng,
        },
        ...(offer?.startingPrice ? { startingPrice: offer.startingPrice } : {}),
        ...(offer?.coverImageUrl ? { imageUrl: offer.coverImageUrl } : {}),
        ...(offer?.externalUrl ? { externalUrl: offer.externalUrl } : {}),
        fetchedAt: offer?.fetchedAt ?? graphEvent.updatedAt,
      },
      warnings: [],
    }
  }

  private routeBundleForEvent(
    event: Extract<MaterializedPathEvent, { kind: "TRANSIT" }>
  ): TransitPlanBundle {
    const current = this.routeFacts.get(event.proposalItemKey)?.bundle
    if (current) return current
    const baseline = this.baseline.journey.events.find(
      (candidate) => candidate.proposalItemKey === event.proposalItemKey
    )
    const graphEvent = baseline
      ? this.baseline.graph.events.find(
          (candidate) => candidate.id === baseline.eventId
        )
      : undefined
    const run =
      graphEvent?.type === "TRANSIT" && graphEvent.detail.activePlanningRunId
        ? this.baseline.graph.transitPlanningRuns.find(
            (candidate) =>
              candidate.id === graphEvent.detail.activePlanningRunId
          )
        : undefined
    if (
      !graphEvent ||
      graphEvent.type !== "TRANSIT" ||
      !run ||
      run.status !== "READY" ||
      !run.plans.length
    ) {
      throw new WorkspaceInputError(
        `Missing resolved route for ${event.proposalItemKey}`
      )
    }
    return {
      transitEventId: graphEvent.id,
      requestFingerprint: run.requestFingerprint,
      plans: run.plans.map((plan) => {
        const {
          planningRunId: _planningRunId,
          transitEventId: _transitEventId,
          ...portable
        } = plan
        return { ...portable, requestFingerprint: run.requestFingerprint }
      }),
      ...(run.warning ? { warning: run.warning } : {}),
    }
  }

  private async compileCurrentDraft(
    toolCallId: string
  ): Promise<CompiledDraft> {
    const draft = new AgentDraftSession(
      this.workspaceId,
      this.runId,
      this.authContext,
      this.commands,
      this.baseline.workspaceRevision
    )
    await draft.openCurrent(`${toolCallId}:open`)
    const initialGraph = draft.currentGraph()
    const activeRootCards = initialGraph.events.filter(
      (event) =>
        event.parentSectionEventId === null &&
        event.introducedRevision <= initialGraph.revision &&
        (!event.retiredRevision ||
          event.retiredRevision > initialGraph.revision)
    )
    const rootTransitCards = activeRootCards.filter(
      (event) => event.type === "TRANSIT"
    )
    const rootOtherCards = activeRootCards.filter(
      (event) => event.type !== "TRANSIT" && event.type !== "SECTION"
    )
    const rootSections = activeRootCards.filter(
      (event) => event.type === "SECTION"
    )
    for (const [index, event] of rootTransitCards.entries()) {
      await draft.removeCard(
        { type: "card.remove", cardId: event.id },
        `${toolCallId}:reset:transit:${index}`
      )
    }
    for (const [index, event] of rootOtherCards.entries()) {
      await draft.removeCard(
        { type: "card.remove", cardId: event.id },
        `${toolCallId}:reset:root:${index}`
      )
    }
    for (const [index, event] of rootSections.entries()) {
      await draft.removeCard(
        {
          type: "card.remove",
          cardId: event.id,
          removeCityChildren: true,
        },
        `${toolCallId}:reset:city:${index}`
      )
    }

    const snapshot = this.materializedEvents()
    const itemToCardId = new Map<string, string>()
    const transitItemToCardId = new Map<string, string>()
    let activeCityLabel: string | null = null
    let activeCityCardId: string | null = null
    let activeCityLastCardId: string | null = null
    let previousCityCardId: string | null = null

    for (const [index, event] of snapshot.entries()) {
      if (event.kind === "TRANSIT") continue
      if (
        event.kind === "STAY" &&
        !this.hotelFacts.has(event.proposalItemKey)
      ) {
        this.hotelFacts.set(
          event.proposalItemKey,
          this.baselineHotelFact(event)
        )
      }
      if (
        event.kind !== "STAY" &&
        !this.placeFacts.has(event.proposalItemKey)
      ) {
        const selection = this.selectionFromCurrentEvent(event, event.kind)
        this.placeFacts.set(event.proposalItemKey, {
          cityLabel: selection.cityLabel,
          resolved: selection.resolved,
        })
      }
      const normalizedCityLabel = this.cityLabelKey(event.cityQuery)
      if (activeCityLabel !== normalizedCityLabel || !activeCityCardId) {
        const location = this.locationForEvent(event)
        const result = await draft.addCity(
          {
            type: "city.add",
            name: event.cityQuery,
            afterCardId: previousCityCardId,
          },
          `${toolCallId}:city:${index}`,
          {
            ...location,
            canonicalName: event.cityQuery,
            city: event.cityQuery,
          }
        )
        const current = draft.currentGraph()
        const added = result.changedCardIds
          .map((id) => current.events.find((candidate) => candidate.id === id))
          .find(
            (candidate) =>
              candidate?.type === "SECTION" && candidate.detail.kind === "CITY"
          )
        if (!added) {
          throw new WorkspaceInputError(
            `City segment was not created for ${event.proposalItemKey}`
          )
        }
        activeCityLabel = normalizedCityLabel
        activeCityCardId = added.id
        activeCityLastCardId = null
        previousCityCardId = added.id
      }
      const cityCardId = activeCityCardId
      if (!cityCardId) {
        throw new WorkspaceInputError(
          `City segment is missing for ${event.proposalItemKey}`
        )
      }
      if (event.kind === "STAY") {
        const fact = this.hotelFacts.get(event.proposalItemKey)
        if (!fact) {
          throw new WorkspaceInputError(
            `Missing hotel fact for ${event.proposalItemKey}`
          )
        }
        const selectionId = draft.registerHotelSelection(
          fact.candidate,
          fact.warnings,
          cityCardId,
          {
            plannedStartAt: event.plannedStartAt,
            plannedEndAt:
              event.plannedEndAt ??
              dateTimeFromTimestamp(
                dateTimeToTimestamp(event.plannedStartAt) + DAY_MS
              ),
          }
        )
        const result = await draft.addStay(
          {
            type: "stay.add",
            cityCardId,
            hotelSelectionId: selectionId,
            description: event.description,
            checkInNote: event.checkInNote,
            afterCardId: activeCityLastCardId ?? undefined,
          },
          `${toolCallId}:stay:${index}`
        )
        const current = draft.currentGraph()
        const added = result.changedCardIds
          .map((id) => current.events.find((candidate) => candidate.id === id))
          .find((candidate) => candidate?.type === "STAY")
        if (!added) {
          throw new WorkspaceInputError(
            `Stay card was not created for ${event.proposalItemKey}`
          )
        }
        itemToCardId.set(event.proposalItemKey, added.id)
        activeCityLastCardId = added.id
      } else {
        const fact = this.placeFacts.get(event.proposalItemKey)
        if (!fact) {
          throw new WorkspaceInputError(
            `Missing place fact for ${event.proposalItemKey}`
          )
        }
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
            afterCardId: activeCityLastCardId ?? undefined,
          },
          `${toolCallId}:place:${index}`
        )
        const current = draft.currentGraph()
        const added = result.changedCardIds
          .map((id) => current.events.find((candidate) => candidate.id === id))
          .find((candidate) => candidate?.type === event.kind)
        if (!added) {
          throw new WorkspaceInputError(
            `Place card was not created for ${event.proposalItemKey}`
          )
        }
        itemToCardId.set(event.proposalItemKey, added.id)
        activeCityLastCardId = added.id
      }
    }

    for (const [index, event] of snapshot.entries()) {
      if (event.kind !== "TRANSIT") continue
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
      const compiledFromCardId = sameCity ? from.id : from.parentSectionEventId
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
        `${toolCallId}:transit:${index}`
      )
      const afterTransit = draft.currentGraph()
      const added = result.changedCardIds
        .map((id) =>
          afterTransit.events.find((candidate) => candidate.id === id)
        )
        .find((candidate) => candidate?.type === "TRANSIT")
      if (!added) {
        throw new WorkspaceInputError(
          `Transit card was not created for ${event.proposalItemKey}`
        )
      }
      itemToCardId.set(event.proposalItemKey, added.id)
      transitItemToCardId.set(event.proposalItemKey, added.id)
    }
    return { draft, itemToCardId, transitItemToCardId }
  }

  private pendingRequirementIssues() {
    const requirements = this.requirements()
    const staleTransitIssues = this.staleTransitIssues()
    return {
      requirements,
      staleTransitIssues,
      issues: [
        ...staleTransitIssues,
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
    }
  }

  async commit(toolCallId: string) {
    const pending = this.pendingRequirementIssues()
    if (pending.issues.length) {
      return {
        committed: false as const,
        issues: pending.issues,
        requirements: pending.requirements,
        nextAction: pending.staleTransitIssues.length
          ? ("REVISE_PATH" as const)
          : ("COMPLETE_REQUIREMENTS" as const),
      }
    }

    let compiled: CompiledDraft
    try {
      compiled = await this.compileCurrentDraft(toolCallId)
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Current Path compilation failed"
      throw new WorkspaceInputError(`PATH_COMPILER_CONTRACT_ERROR: ${message}`)
    }
    let validation: Awaited<ReturnType<AgentDraftSession["validateCurrent"]>>
    try {
      validation = await compiled.draft.validateCurrent(
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
            [...compiled.transitItemToCardId.values()].includes(cardId)
          )
          if (transitCardId) {
            const proposalItemKey = [...compiled.transitItemToCardId].find(
              ([, cardId]) => cardId === transitCardId
            )?.[0]
            const pathEvent = proposalItemKey
              ? this.materializedEventMap().get(proposalItemKey)
              : undefined
            if (!pathEvent || pathEvent.kind !== "TRANSIT") {
              throw new WorkspaceInputError(
                `Transit item is missing for ${proposalItemKey ?? transitCardId}`
              )
            }
            await compiled.draft.prepareTransitCurrent(
              transitCardId,
              `${toolCallId}:route:${transitCardId}`,
              {
                ...this.routeBundleForEvent(pathEvent),
                transitEventId: transitCardId,
              }
            )
          }
        }
        validation = await compiled.draft.validateCurrent(
          `${toolCallId}:validate-routes`
        )
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Current Path validation failed"
      throw new WorkspaceInputError(`PATH_COMPILER_CONTRACT_ERROR: ${message}`)
    }
    if (!validation.validation.valid) {
      return {
        committed: false as const,
        issues: validation.validation.issues.map((issue) => ({
          code: issue.code,
          severity: issue.severity,
          message: issue.message,
        })),
        requirements: this.requirements(),
        nextAction: "REVISE_PATH" as const,
      }
    }

    const committed = await compiled.draft.commitCurrent(toolCallId)
    const keys = changedEventKeys(this.entries)
    const committedFlat = projectFlatJourney(
      compiled.draft.currentGraph(),
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
      committed: true as const,
      newWorkspaceRevision: committed.newWorkspaceRevision,
      projectionHash: committed.projectionHash,
      summary: keys.length
        ? `已更新 ${keys.length} 个行程事件`
        : "行程未发生变化",
      changedEventIds,
      issues: validation.validation.issues.map((issue) => ({
        code: issue.code,
        severity: issue.severity,
        message: issue.message,
      })),
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
    const staleTransitIssues = this.staleTransitIssues()

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
      // Tool rejections stay in the native Tool transcript and audit log.
      // They are not current Path blockers once the next call succeeds.
    }

    return {
      sequence: this.entries.at(-1)?.sequence ?? 0,
      baseRevision: this.baseline.workspaceRevision,
      materializedPath,
      requirements,
      conflicts: staleTransitIssues,
      warnings: [],
      unresolved: [...unresolvedByKey.values()],
      changeLogEntriesRemaining: Math.max(
        0,
        MAX_CHANGE_LOG_ENTRIES - this.entries.length
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
  }

  fingerprint() {
    return createHash("sha256")
      .update(JSON.stringify(this.changeLogContext()))
      .digest("hex")
  }
}
