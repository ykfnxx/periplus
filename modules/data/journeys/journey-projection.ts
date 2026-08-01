import {
  targetResolvedJourneyProjectionSchema,
  type TargetJourneyEvent,
  type TargetJourneyEventLink,
  type TargetJourneyGraphSnapshot,
  type TargetProjectionMode,
  type TargetResolvedEvent,
  type TargetResolvedJourneyProjection,
} from "@/modules/data-model/contracts"
import {
  findStructuredBranchIssue,
  validateJourneyGraph,
} from "@/modules/data/journeys/journey-graph-validator"

export type JourneyProjectionErrorCode =
  | "INVALID_REVISION"
  | "INVALID_SCOPE"
  | "INVALID_BRANCH_SELECTION"
  | "INVALID_BRANCH_KEY"
  | "NON_CONVERGENT_BRANCH"
  | "CROSSING_BRANCH"
  | "UNRESOLVABLE_TOPOLOGY"

export class JourneyProjectionError extends Error {
  constructor(
    public readonly code: JourneyProjectionErrorCode,
    message: string
  ) {
    super(message)
    this.name = "JourneyProjectionError"
  }
}

export interface ResolveJourneyProjectionInput {
  graph: TargetJourneyGraphSnapshot
  scopeSectionEventId: string | null
  mode: TargetProjectionMode
  asOfRevision?: number
}

const LOCATION_EVENT_TYPES = new Set(["VISIT", "STAY", "MEAL", "ACTIVITY"])

type ResolvedTimes = {
  startAt?: string
  endAt?: string
  valueSource: "PLANNED" | "ACTUAL"
  usesPlannedFallback: boolean
}

function fail(code: JourneyProjectionErrorCode, message: string): never {
  throw new JourneyProjectionError(code, message)
}

function compareIds(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0
}

function linkComparator(
  left: TargetJourneyEventLink,
  right: TargetJourneyEventLink
) {
  return left.rank - right.rank || compareIds(left.id, right.id)
}

function topologicalSort(
  events: readonly TargetJourneyEvent[],
  links: readonly TargetJourneyEventLink[]
): TargetJourneyEvent[] {
  const eventById = new Map(events.map((event) => [event.id, event]))
  const indegree = new Map(events.map((event) => [event.id, 0]))
  const outgoing = new Map(
    events.map((event) => [event.id, [] as TargetJourneyEventLink[]])
  )
  const incomingRank = new Map(
    events.map((event) => [event.id, Number.MAX_SAFE_INTEGER])
  )

  for (const link of links) {
    if (!eventById.has(link.fromEventId) || !eventById.has(link.toEventId))
      continue
    indegree.set(link.toEventId, (indegree.get(link.toEventId) ?? 0) + 1)
    outgoing.get(link.fromEventId)!.push(link)
    incomingRank.set(
      link.toEventId,
      Math.min(incomingRank.get(link.toEventId)!, link.rank)
    )
  }
  for (const values of outgoing.values()) values.sort(linkComparator)

  const compareEventIds = (left: string, right: string) =>
    (incomingRank.get(left) ?? Number.MAX_SAFE_INTEGER) -
      (incomingRank.get(right) ?? Number.MAX_SAFE_INTEGER) ||
    compareIds(left, right)
  const ready = events
    .filter((event) => indegree.get(event.id) === 0)
    .map((event) => event.id)
    .sort(compareEventIds)
  const ordered: TargetJourneyEvent[] = []

  while (ready.length) {
    const eventId = ready.shift()!
    ordered.push(eventById.get(eventId)!)
    for (const link of outgoing.get(eventId) ?? []) {
      const next = (indegree.get(link.toEventId) ?? 0) - 1
      indegree.set(link.toEventId, next)
      if (next === 0) {
        ready.push(link.toEventId)
        ready.sort(compareEventIds)
      }
    }
  }

  if (ordered.length !== events.length) {
    fail("UNRESOLVABLE_TOPOLOGY", "projection scope does not form a DAG")
  }
  return ordered
}

function reachableFrom(
  startEventId: string,
  outgoing: ReadonlyMap<string, readonly TargetJourneyEventLink[]>
) {
  const reached = new Set<string>()
  const stack = [startEventId]
  while (stack.length) {
    const eventId = stack.pop()!
    if (reached.has(eventId)) continue
    reached.add(eventId)
    for (const link of outgoing.get(eventId) ?? []) stack.push(link.toEventId)
  }
  return reached
}

function selectCurrentBranchLinks(
  graph: TargetJourneyGraphSnapshot,
  revision: number,
  events: readonly TargetJourneyEvent[],
  links: readonly TargetJourneyEventLink[]
) {
  const eligibleSelections = graph.branchSelections.filter(
    (selection) => selection.journeyRevision <= revision
  )
  const superseded = new Set(
    eligibleSelections.flatMap((selection) =>
      selection.supersedesId ? [selection.supersedesId] : []
    )
  )
  const currentByFork = new Map(
    eligibleSelections
      .filter((selection) => !superseded.has(selection.id))
      .map((selection) => [selection.forkEventId, selection])
  )
  const outgoing = new Map(
    events.map((event) => [event.id, [] as TargetJourneyEventLink[]])
  )
  for (const link of links) outgoing.get(link.fromEventId)?.push(link)
  for (const values of outgoing.values()) values.sort(linkComparator)

  const selectedLinkIds = new Set(links.map((link) => link.id))
  for (const [forkEventId, candidates] of outgoing) {
    if (candidates.length < 2) continue
    const current = currentByFork.get(forkEventId)
    const selected = current
      ? candidates.find((link) => link.id === current.selectedLinkId)
      : candidates.find((link) => link.kind === "MAIN")
    if (!selected) {
      fail(
        "INVALID_BRANCH_SELECTION",
        `fork ${forkEventId} has no valid current selection or MAIN fallback`
      )
    }
    for (const candidate of candidates) {
      if (candidate.id !== selected.id) selectedLinkIds.delete(candidate.id)
    }
  }
  return links.filter((link) => selectedLinkIds.has(link.id))
}

function executableEvent(event: TargetJourneyEvent) {
  return event.type !== "SECTION" && event.type !== "NOTE"
}

function selectedEventsForScope(
  graph: TargetJourneyGraphSnapshot,
  scopeSectionEventId: string | null,
  mode: TargetProjectionMode,
  revision: number
): TargetJourneyEvent[] {
  const scopedEvents = graph.events.filter(
    (event) =>
      event.parentSectionEventId === scopeSectionEventId &&
      event.placementStatus === "SCHEDULED" &&
      event.introducedRevision <= revision &&
      (!event.retiredRevision || event.retiredRevision > revision)
  )
  const scopedEventIds = new Set(scopedEvents.map((event) => event.id))
  const scopedLinks = graph.links.filter(
    (link) =>
      scopedEventIds.has(link.fromEventId) &&
      scopedEventIds.has(link.toEventId) &&
      link.introducedRevision <= revision &&
      (!link.retiredRevision || link.retiredRevision > revision)
  )

  const selectedLinks = selectCurrentBranchLinks(
    graph,
    revision,
    scopedEvents,
    scopedLinks
  )
  const fullIncomingCount = new Map(scopedEvents.map((event) => [event.id, 0]))
  const selectedOutgoing = new Map(
    scopedEvents.map((event) => [event.id, [] as TargetJourneyEventLink[]])
  )
  for (const link of scopedLinks) {
    fullIncomingCount.set(
      link.toEventId,
      (fullIncomingCount.get(link.toEventId) ?? 0) + 1
    )
  }
  for (const link of selectedLinks) {
    selectedOutgoing.get(link.fromEventId)?.push(link)
  }
  const reached = new Set<string>()
  for (const root of scopedEvents.filter(
    (event) => fullIncomingCount.get(event.id) === 0
  )) {
    for (const eventId of reachableFrom(root.id, selectedOutgoing)) {
      reached.add(eventId)
    }
  }
  const selectedEvents = scopedEvents.filter((event) => reached.has(event.id))
  const ordered = topologicalSort(
    selectedEvents,
    selectedLinks.filter(
      (link) => reached.has(link.fromEventId) && reached.has(link.toEventId)
    )
  )
  if (mode !== "TRAVELOGUE") return ordered
  return ordered.filter(
    (event) =>
      (executableEvent(event) && event.executionStatus === "CONFIRMED") ||
      (event.type === "SECTION" &&
        selectedEventsForScope(graph, event.id, mode, revision).length > 0)
  )
}

function resolveTimes(
  event: TargetJourneyEvent,
  mode: TargetProjectionMode
): ResolvedTimes {
  if (!executableEvent(event)) {
    return { valueSource: "PLANNED", usesPlannedFallback: false }
  }
  if (mode === "PLANNER") {
    return {
      startAt: event.plannedStartAt,
      endAt: event.plannedEndAt,
      valueSource: "PLANNED",
      usesPlannedFallback: false,
    }
  }
  const startAt = event.actualStartAt ?? event.plannedStartAt
  const endAt = event.actualEndAt ?? event.plannedEndAt
  const usesPlannedFallback =
    (!event.actualStartAt && event.plannedStartAt !== undefined) ||
    (!event.actualEndAt && event.plannedEndAt !== undefined)
  const hasActualTime =
    event.actualStartAt !== undefined || event.actualEndAt !== undefined
  return {
    startAt,
    endAt,
    valueSource: hasActualTime && !usesPlannedFallback ? "ACTUAL" : "PLANNED",
    usesPlannedFallback,
  }
}

function derivedSectionTimes(
  graph: TargetJourneyGraphSnapshot,
  sectionEventId: string,
  mode: TargetProjectionMode,
  revision: number
): ResolvedTimes {
  const childTimes: ResolvedTimes[] = selectedEventsForScope(
    graph,
    sectionEventId,
    mode,
    revision
  )
    .map((event) =>
      event.type === "SECTION"
        ? derivedSectionTimes(graph, event.id, mode, revision)
        : resolveTimes(event, mode)
    )
    .filter((times) => times.startAt !== undefined || times.endAt !== undefined)
  const starts = childTimes
    .flatMap((times) => (times.startAt ? [times.startAt] : []))
    .sort()
  const ends = childTimes
    .flatMap((times) => (times.endAt ? [times.endAt] : []))
    .sort()
  const allActual =
    mode !== "PLANNER" &&
    childTimes.length > 0 &&
    childTimes.every(
      (times) => times.valueSource === "ACTUAL" && !times.usesPlannedFallback
    )
  return {
    startAt: starts[0],
    endAt: ends.at(-1),
    valueSource: allActual ? ("ACTUAL" as const) : ("PLANNED" as const),
    usesPlannedFallback:
      mode !== "PLANNER" &&
      childTimes.some(
        (times) => times.valueSource === "PLANNED" || times.usesPlannedFallback
      ),
  }
}

export function resolveJourneyProjection({
  graph: input,
  scopeSectionEventId,
  mode,
  asOfRevision,
}: ResolveJourneyProjectionInput): TargetResolvedJourneyProjection {
  const branchIssue = findStructuredBranchIssue(input)
  if (branchIssue) fail(branchIssue.code, branchIssue.message)
  const graph = validateJourneyGraph(input)
  if (asOfRevision !== undefined && asOfRevision !== graph.revision) {
    fail(
      "INVALID_REVISION",
      `projection requires the exact revision snapshot: requested ${asOfRevision}, received graph revision ${graph.revision}`
    )
  }
  const revision = graph.revision
  if (scopeSectionEventId !== null) {
    const scope = graph.events.find((event) => event.id === scopeSectionEventId)
    if (!scope || scope.type !== "SECTION") {
      fail("INVALID_SCOPE", `${scopeSectionEventId} is not a SECTION event`)
    }
  }

  const ordered = selectedEventsForScope(
    graph,
    scopeSectionEventId,
    mode,
    revision
  )

  const locationOrdinalByEventId = new Map<string, number>()
  let locationOrdinal = 0
  for (const event of ordered) {
    if (!LOCATION_EVENT_TYPES.has(event.type)) continue
    locationOrdinal += 1
    locationOrdinalByEventId.set(event.id, locationOrdinal)
  }

  const events = ordered.map<TargetResolvedEvent>((event, resolvedPosition) => {
    const resolvedTimes =
      event.type === "SECTION"
        ? derivedSectionTimes(graph, event.id, mode, revision)
        : resolveTimes(event, mode)
    const resolved: TargetResolvedEvent = {
      eventId: event.id,
      resolvedPosition,
      title: event.title,
      startAt: resolvedTimes.startAt,
      endAt: resolvedTimes.endAt,
      valueSource: resolvedTimes.valueSource,
    }
    const ordinal = locationOrdinalByEventId.get(event.id)
    if (ordinal !== undefined) resolved.locationOrdinal = ordinal
    if (event.type === "TRANSIT") {
      const resolveActualEndpoints = mode !== "PLANNER"
      const fromEventId = resolveActualEndpoints
        ? (event.detail.actualFromEventId ?? event.detail.plannedFromEventId)
        : event.detail.plannedFromEventId
      const toEventId = resolveActualEndpoints
        ? (event.detail.actualToEventId ?? event.detail.plannedToEventId)
        : event.detail.plannedToEventId
      const fromOrdinal = fromEventId
        ? locationOrdinalByEventId.get(fromEventId)
        : undefined
      const toOrdinal = toEventId
        ? locationOrdinalByEventId.get(toEventId)
        : undefined
      if (fromOrdinal !== undefined) resolved.fromLocationOrdinal = fromOrdinal
      if (toOrdinal !== undefined) resolved.toLocationOrdinal = toOrdinal
      if (
        resolveActualEndpoints &&
        ((event.detail.actualFromEventId === undefined &&
          event.detail.plannedFromEventId !== undefined) ||
          (event.detail.actualToEventId === undefined &&
            event.detail.plannedToEventId !== undefined))
      ) {
        resolved.valueSource = "PLANNED"
      }
    }
    return resolved
  })

  return targetResolvedJourneyProjectionSchema.parse({
    journeyId: graph.id,
    revision,
    scopeSectionEventId,
    mode,
    events,
  })
}
