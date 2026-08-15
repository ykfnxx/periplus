import { createHash } from "node:crypto"
import type { AuthContext } from "@/modules/auth/server/context"
import type { HotelCandidate, HotelProviderWarning } from "@/lib/hotels/types"
import type { PlaceResolveResult, PlaceRef } from "@/lib/places/types"
import type {
  TransitPlanBundle,
  TransitPlanEndpoint,
} from "@/lib/journeys/planning"
import { normalizePlaceName } from "@/lib/places/normalize"
import { projectFlatJourney } from "@/modules/data/journeys/flat-journey-projection"
import type { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"
import { WorkspaceInputError } from "@/modules/data/workspaces/workspace-repository"
import { AgentDraftSession } from "./draft-session"
import { baselineItemKey, type PlannerBaseline } from "./planner-baseline"
import type { ParsedAgentToolRequest, PathEventInput } from "./tool-contract"

type PlaceRequest = Extract<ParsedAgentToolRequest, { type: "place.resolve" }>
type HotelRequest = Extract<ParsedAgentToolRequest, { type: "hotel.search" }>
type RouteRequest = Extract<ParsedAgentToolRequest, { type: "route.resolve" }>

type PlanningLogEntry =
  | {
      sequence: number
      type: "FACT_RESOLVED"
      subject: "CITY" | "PLACE" | "HOTEL" | "ROUTE"
      proposalItemKey: string
      summary: string
      data: Record<string, unknown>
    }
  | {
      sequence: number
      type: "FACT_REJECTED"
      subject: "CITY" | "PLACE" | "HOTEL" | "ROUTE"
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
      event: PathEventInput
      afterItemKey: string | null
      reason: string
    }
  | {
      sequence: number
      type: "EVENT_REPLACED"
      itemKey: string
      event: PathEventInput
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

type CityFact = {
  query: string
  proposalItemKey: string
  canonicalName: string
  location: PlaceRef
  timeZone: string
  administrativeLevel: "province" | "city"
}
type PlaceFact = {
  request: PlaceRequest
  resolved: Extract<PlaceResolveResult, { status: "resolved" }>
}
type HotelFact = {
  request: HotelRequest
  candidate: HotelCandidate
  warnings: HotelProviderWarning[]
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
const CITY_SUFFIX = /(?:特别行政区|自治州|地区|盟|省|市)$/u

function cityFactKey(value: string) {
  return normalizePlaceName(value).replace(CITY_SUFFIX, "")
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
  private readonly cityFacts = new Map<string, CityFact>()
  private readonly placeFacts = new Map<string, PlaceFact>()
  private readonly hotelFacts = new Map<string, HotelFact>()
  private readonly routeFacts = new Map<
    string,
    { request: RouteRequest; bundle: TransitPlanBundle }
  >()
  private validated: ValidatedFold | null = null
  private validationCount = 0

  constructor(
    private readonly workspaceId: string,
    private readonly runId: string,
    private readonly authContext: AuthContext,
    private readonly commands: WorkspaceCommandService,
    private readonly baseline: PlannerBaseline
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
    this.validated = null
    return appended
  }

  cityFact(query: string) {
    return this.cityFacts.get(cityFactKey(query))
  }

  recordCity(
    query: string,
    proposalItemKey: string,
    canonicalName: string,
    location: PlaceRef,
    timeZone: string,
    administrativeLevel: "province" | "city"
  ) {
    const existing = this.cityFacts.get(cityFactKey(query))
    if (existing) return existing
    const fact: CityFact = {
      query,
      proposalItemKey,
      canonicalName,
      location,
      timeZone,
      administrativeLevel,
    }
    this.cityFacts.set(cityFactKey(query), fact)
    this.cityFacts.set(cityFactKey(canonicalName), fact)
    this.append({
      type: "FACT_RESOLVED",
      subject: "CITY",
      proposalItemKey,
      summary: `${query} → ${canonicalName}`,
      data: { name: canonicalName, timeZone, administrativeLevel },
    })
    return fact
  }

  recordPlace(
    request: PlaceRequest,
    resolved: Extract<PlaceResolveResult, { status: "resolved" }>
  ) {
    this.placeFacts.set(request.proposalItemKey, { request, resolved })
    this.append({
      type: "FACT_RESOLVED",
      subject: "PLACE",
      proposalItemKey: request.proposalItemKey,
      summary: `${request.query} → ${resolved.placeRef.canonicalName}（${resolved.placeRef.city ?? request.cityQuery}）`,
      data: {
        name: resolved.placeRef.canonicalName,
        city: resolved.placeRef.city ?? request.cityQuery,
        address: resolved.placeRef.address,
        category: resolved.place.category,
      },
    })
    return {
      proposalItemKey: request.proposalItemKey,
      name: resolved.placeRef.canonicalName,
      city: resolved.placeRef.city ?? request.cityQuery,
      address: resolved.placeRef.address,
      category: resolved.place.category,
      nextAction: "APPEND_EVENT" as const,
    }
  }

  recordFactRejected(
    request: PlaceRequest | HotelRequest | RouteRequest,
    code: string,
    message: string
  ) {
    const subject = request.type.startsWith("place.")
      ? ("PLACE" as const)
      : request.type.startsWith("hotel.")
        ? ("HOTEL" as const)
        : ("ROUTE" as const)
    this.append({
      type: "FACT_REJECTED",
      subject,
      proposalItemKey: request.proposalItemKey,
      code,
      message,
    })
  }

  recordToolRejected(tool: string, code: string, message: string) {
    this.append({ type: "TOOL_REJECTED", tool, code, message })
  }

  recordHotel(
    request: HotelRequest,
    candidate: HotelCandidate,
    warnings: HotelProviderWarning[]
  ) {
    this.hotelFacts.set(request.proposalItemKey, {
      request,
      candidate,
      warnings,
    })
    this.append({
      type: "FACT_RESOLVED",
      subject: "HOTEL",
      proposalItemKey: request.proposalItemKey,
      summary: `${request.cityQuery}住宿 → ${candidate.name}`,
      data: {
        name: candidate.name,
        address: candidate.address,
        startingPrice: candidate.startingPrice,
      },
    })
    return {
      proposalItemKey: request.proposalItemKey,
      name: candidate.name,
      address: candidate.address,
      startingPrice: candidate.startingPrice,
      nextAction: "APPEND_EVENT" as const,
    }
  }

  routeEndpoints(request: RouteRequest) {
    return {
      origin: this.endpointForItem(request.fromItemKey),
      destination: this.endpointForItem(request.toItemKey),
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

  recordRoute(request: RouteRequest, bundle: TransitPlanBundle) {
    const selected = bundle.plans[0]
    if (!selected) throw new WorkspaceInputError("ROUTE_NOT_FOUND")
    const normalizedRequest: RouteRequest = {
      ...request,
      transportMode: request.transportMode ?? "WALK",
      preference: request.preference ?? "RECOMMENDED",
    }
    this.routeFacts.set(request.proposalItemKey, {
      request: normalizedRequest,
      bundle,
    })
    this.append({
      type: "FACT_RESOLVED",
      subject: "ROUTE",
      proposalItemKey: request.proposalItemKey,
      summary: `${request.fromItemKey} → ${request.toItemKey}`,
      data: {
        fromItemKey: request.fromItemKey,
        toItemKey: request.toItemKey,
        transportMode: normalizedRequest.transportMode,
        durationMinutes: Math.ceil(selected.durationSeconds / 60),
        distanceKm: selected.distanceMeters / 1000,
        routeLabel: selected.label,
      },
    })
    return {
      proposalItemKey: request.proposalItemKey,
      fromItemKey: request.fromItemKey,
      toItemKey: request.toItemKey,
      transportMode: normalizedRequest.transportMode,
      durationMinutes: Math.ceil(selected.durationSeconds / 60),
      distanceKm: selected.distanceMeters / 1000,
      routeLabel: selected.label,
      nextAction: "APPEND_EVENT" as const,
    }
  }

  appendEvent(
    request: Extract<ParsedAgentToolRequest, { type: "path.append_event" }>
  ) {
    this.assertEventFacts(request.event)
    const order = this.currentItemOrder()
    if (order.includes(request.event.proposalItemKey)) {
      throw new WorkspaceInputError(
        `Proposal item ${request.event.proposalItemKey} already exists`
      )
    }
    if (request.afterItemKey === null && order.length) {
      throw new WorkspaceInputError(
        "afterItemKey may be null only when the path is empty"
      )
    }
    if (
      request.afterItemKey !== null &&
      !order.includes(request.afterItemKey)
    ) {
      throw new WorkspaceInputError(
        `Unknown order anchor ${request.afterItemKey}`
      )
    }
    if (request.event.kind === "TRANSIT") {
      const fromIndex = order.indexOf(request.event.fromItemKey)
      const toIndex = order.indexOf(request.event.toItemKey)
      if (
        fromIndex < 0 ||
        toIndex !== fromIndex + 1 ||
        request.afterItemKey !== request.event.fromItemKey
      ) {
        throw new WorkspaceInputError(
          "TRANSIT must be inserted between adjacent non-Transit endpoints"
        )
      }
    }
    const entry = this.append({
      type: "EVENT_APPENDED",
      event: request.event,
      afterItemKey: request.afterItemKey,
      reason: request.reason,
    })
    return {
      acceptedSequence: entry.sequence,
      proposalItemKey: request.event.proposalItemKey,
      nextAction: "CONTINUE_OR_VALIDATE" as const,
    }
  }

  replaceEvent(
    request: Extract<ParsedAgentToolRequest, { type: "path.replace_event" }>
  ) {
    this.assertKnownItem(request.itemKey)
    this.assertEventFacts(request.event, request.itemKey)
    const order = this.currentItemOrder()
    if (
      request.event.proposalItemKey !== request.itemKey &&
      order.includes(request.event.proposalItemKey)
    ) {
      throw new WorkspaceInputError(
        `Proposal item ${request.event.proposalItemKey} already exists`
      )
    }
    if (request.event.kind === "TRANSIT") {
      const remainingOrder = order.filter(
        (itemKey) => itemKey !== request.itemKey
      )
      const fromIndex = remainingOrder.indexOf(request.event.fromItemKey)
      const toIndex = remainingOrder.indexOf(request.event.toItemKey)
      const replacementIndex = order.indexOf(request.itemKey)
      if (
        fromIndex < 0 ||
        toIndex !== fromIndex + 1 ||
        replacementIndex !== fromIndex + 1
      ) {
        throw new WorkspaceInputError(
          "TRANSIT must replace the slot between adjacent non-Transit endpoints"
        )
      }
    }
    const entry = this.append({
      type: "EVENT_REPLACED",
      itemKey: request.itemKey,
      event: request.event,
      reason: request.reason,
    })
    return {
      acceptedSequence: entry.sequence,
      replacedItemKey: request.itemKey,
      proposalItemKey: request.event.proposalItemKey,
      nextAction: "VALIDATE" as const,
    }
  }

  removeEvent(
    request: Extract<ParsedAgentToolRequest, { type: "path.remove_event" }>
  ) {
    this.assertKnownItem(request.itemKey)
    const entry = this.append({
      type: "EVENT_REMOVED",
      itemKey: request.itemKey,
      reason: request.reason,
    })
    return {
      acceptedSequence: entry.sequence,
      removedItemKey: request.itemKey,
      nextAction: "VALIDATE" as const,
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

  private assertEventFacts(event: PathEventInput, replacedItemKey?: string) {
    if (event.kind === "TRANSIT") {
      const route = this.routeFacts.get(event.proposalItemKey)
      if (
        !route ||
        route.request.fromItemKey !== event.fromItemKey ||
        route.request.toItemKey !== event.toItemKey ||
        route.request.transportMode !== event.transportMode ||
        route.request.preference !== (event.preference ?? "RECOMMENDED")
      ) {
        throw new WorkspaceInputError(
          `route.resolve is required for ${event.proposalItemKey}`
        )
      }
      return
    }
    const cityKey = cityFactKey(event.cityQuery)
    const replacedEvent = replacedItemKey
      ? this.baseline.journey.events.find(
          (candidate) => candidate.proposalItemKey === replacedItemKey
        )
      : undefined
    const keepsCommittedCity =
      replacedEvent?.kind !== "TRANSIT" &&
      replacedEvent?.city !== undefined &&
      cityFactKey(replacedEvent.city) === cityKey
    if (!this.cityFacts.has(cityKey) && !keepsCommittedCity) {
      throw new WorkspaceInputError(
        `A canonical city fact is required for ${event.cityQuery}`
      )
    }
    if (event.kind === "STAY") {
      const hotel = this.hotelFacts.get(event.proposalItemKey)
      if (
        !hotel ||
        cityFactKey(hotel.request.cityQuery) !== cityFactKey(event.cityQuery)
      ) {
        throw new WorkspaceInputError(
          `hotel.search for ${event.cityQuery} is required for ${event.proposalItemKey}`
        )
      }
      return
    }
    const fact = this.placeFacts.get(event.proposalItemKey)
    if (!fact || fact.request.kind !== event.kind) {
      throw new WorkspaceInputError(
        `place.resolve is required for ${event.proposalItemKey}`
      )
    }
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
      cityQuery: string,
      afterItemKey: string | null,
      suffix: string,
      preferredCityCardId?: string
    ) => {
      const normalized = cityFactKey(cityQuery)
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
        cityFactKey(preferredCity.title) === normalized
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
      ].find((city) => cityFactKey(city.title) === normalized)
      if (existing) return existing.id
      const fact = this.cityFacts.get(normalized)
      if (!fact) throw new WorkspaceInputError(`Missing city fact ${cityQuery}`)
      const previousCity = leftCities[0]
      const result = await draft.addCity(
        {
          type: "city.add",
          name: fact.canonicalName,
          afterCardId: previousCity?.id ?? null,
        },
        `${toolCallId}:city:${suffix}`,
        fact.location
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
      event: PathEventInput,
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
        event.cityQuery,
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
            plannedStartAt:
              event.plannedStartAt ??
              `${fact.request.checkInDate}T15:00:00+08:00`,
            plannedEndAt:
              event.plannedEndAt ??
              new Date(
                Date.parse(`${fact.request.checkInDate}T15:00:00+08:00`) +
                  fact.request.stayNights * 86_400_000
              ).toISOString(),
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
    const entry = this.append({
      type: "VALIDATION_RESULT",
      valid: validation.validation.valid,
      issueCodes: validation.validation.issues.map((issue) => issue.code),
    })
    this.validated = {
      ...folded,
      logSequence: entry.sequence,
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
      this.validated.logSequence !== this.entries.at(-1)?.sequence
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
    const eventByKey = new Map<
      string,
      PathEventInput | PlannerBaseline["journey"]["events"][number]
    >(
      this.baseline.journey.events.map((event) => [
        event.proposalItemKey,
        event,
      ])
    )
    for (const entry of this.semanticEntries()) {
      if (entry.type === "EVENT_REMOVED") {
        eventByKey.delete(entry.itemKey)
        continue
      }
      if (entry.type === "EVENT_REPLACED") {
        eventByKey.delete(entry.itemKey)
      }
      eventByKey.set(entry.event.proposalItemKey, entry.event)
    }
    const candidate = this.currentItemOrder().flatMap((proposalItemKey) => {
      const event = eventByKey.get(proposalItemKey)
      if (!event) return []
      return [
        {
          proposalItemKey,
          kind: event.kind,
          title: event.title,
          ...(event.kind === "TRANSIT"
            ? {
                fromItemKey: event.fromItemKey,
                toItemKey: event.toItemKey,
                transportMode: event.transportMode,
              }
            : {
                city:
                  "cityQuery" in event ? event.cityQuery : (event.city ?? ""),
              }),
          ...(event.plannedStartAt
            ? { plannedStartAt: event.plannedStartAt }
            : {}),
          ...(event.plannedEndAt ? { plannedEndAt: event.plannedEndAt } : {}),
        },
      ]
    })

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
      candidate,
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
    this.cityFacts.clear()
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
