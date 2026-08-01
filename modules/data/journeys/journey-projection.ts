import {
  targetResolvedJourneyProjectionSchema,
  type TargetJourneyEvent,
  type TargetJourneyEventLink,
  type TargetJourneyGraphSnapshot,
  type TargetProjectionMode,
  type TargetResolvedEvent,
  type TargetResolvedJourneyProjection,
} from "@/modules/data-model/contracts"
import { validateJourneyGraph } from "@/modules/data/journeys/journey-graph-validator"

export type JourneyProjectionErrorCode =
  | "INVALID_REVISION"
  | "INVALID_SCOPE"
  | "INVALID_BRANCH_SELECTION"
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

type BranchInterval = {
  forkEventId: string
  joinEventId: string
  start: number
  end: number
}

const LOCATION_EVENT_TYPES = new Set(["VISIT", "STAY", "MEAL", "ACTIVITY"])

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

function validateBranchIntervals(
  events: readonly TargetJourneyEvent[],
  links: readonly TargetJourneyEventLink[]
) {
  const ordered = topologicalSort(events, links)
  const position = new Map(ordered.map((event, index) => [event.id, index]))
  const outgoing = new Map(
    events.map((event) => [event.id, [] as TargetJourneyEventLink[]])
  )
  for (const link of links) outgoing.get(link.fromEventId)?.push(link)
  for (const values of outgoing.values()) values.sort(linkComparator)

  const intervals: BranchInterval[] = []
  for (const event of events) {
    const branches = outgoing.get(event.id) ?? []
    if (branches.length < 2) continue
    const reachable = branches.map((link) =>
      reachableFrom(link.toEventId, outgoing)
    )
    const common = [...reachable[0]!].filter((eventId) =>
      reachable.every((values) => values.has(eventId))
    )
    common.sort(
      (left, right) =>
        (position.get(left) ?? Number.MAX_SAFE_INTEGER) -
          (position.get(right) ?? Number.MAX_SAFE_INTEGER) ||
        compareIds(left, right)
    )
    const joinEventId = common[0]
    if (!joinEventId) {
      fail(
        "NON_CONVERGENT_BRANCH",
        `fork ${event.id} has no common downstream join`
      )
    }
    intervals.push({
      forkEventId: event.id,
      joinEventId,
      start: position.get(event.id)!,
      end: position.get(joinEventId)!,
    })
  }

  for (let leftIndex = 0; leftIndex < intervals.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < intervals.length;
      rightIndex += 1
    ) {
      const left = intervals[leftIndex]!
      const right = intervals[rightIndex]!
      const crosses =
        (left.start < right.start &&
          right.start < left.end &&
          left.end < right.end) ||
        (right.start < left.start &&
          left.start < right.end &&
          right.end < left.end)
      if (crosses) {
        fail(
          "CROSSING_BRANCH",
          `branch intervals ${left.forkEventId}→${left.joinEventId} and ${right.forkEventId}→${right.joinEventId} cross`
        )
      }
    }
  }
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

function hasActualValue(event: TargetJourneyEvent) {
  if (!executableEvent(event)) return false
  if (event.actualStartAt || event.actualEndAt) return true
  if (
    event.executionStatus === "STARTED" ||
    event.executionStatus === "CONFIRMED"
  )
    return true
  if (event.type === "TRANSIT") {
    return Object.entries(event.detail).some(
      ([key, value]) => key.startsWith("actual") && value !== undefined
    )
  }
  return Object.entries(event.detail).some(
    ([key, value]) => key.startsWith("actual") && value !== undefined
  )
}

function resolveTimes(
  event: TargetJourneyEvent,
  mode: TargetProjectionMode
): {
  startAt?: string
  endAt?: string
  valueSource: "PLANNED" | "ACTUAL"
} {
  if (!executableEvent(event)) return { valueSource: "PLANNED" }
  if (mode === "PLANNER") {
    return {
      startAt: event.plannedStartAt,
      endAt: event.plannedEndAt,
      valueSource: "PLANNED",
    }
  }
  if (mode === "TRAVELOGUE") {
    return {
      startAt: event.actualStartAt,
      endAt: event.actualEndAt,
      valueSource: "ACTUAL",
    }
  }
  if (hasActualValue(event)) {
    return {
      startAt: event.actualStartAt ?? event.plannedStartAt,
      endAt: event.actualEndAt ?? event.plannedEndAt,
      valueSource: "ACTUAL",
    }
  }
  return {
    startAt: event.plannedStartAt,
    endAt: event.plannedEndAt,
    valueSource: "PLANNED",
  }
}

export function resolveJourneyProjection({
  graph: input,
  scopeSectionEventId,
  mode,
  asOfRevision,
}: ResolveJourneyProjectionInput): TargetResolvedJourneyProjection {
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

  validateBranchIntervals(scopedEvents, scopedLinks)
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
  for (const link of selectedLinks)
    selectedOutgoing.get(link.fromEventId)?.push(link)
  const reached = new Set<string>()
  for (const root of scopedEvents.filter(
    (event) => fullIncomingCount.get(event.id) === 0
  )) {
    for (const eventId of reachableFrom(root.id, selectedOutgoing))
      reached.add(eventId)
  }
  const selectedEvents = scopedEvents.filter((event) => reached.has(event.id))
  const ordered = topologicalSort(
    selectedEvents,
    selectedLinks.filter(
      (link) => reached.has(link.fromEventId) && reached.has(link.toEventId)
    )
  ).filter(
    (event) =>
      mode !== "TRAVELOGUE" ||
      (executableEvent(event) && event.executionStatus === "CONFIRMED")
  )

  const locationOrdinalByEventId = new Map<string, number>()
  let locationOrdinal = 0
  for (const event of ordered) {
    if (!LOCATION_EVENT_TYPES.has(event.type)) continue
    locationOrdinal += 1
    locationOrdinalByEventId.set(event.id, locationOrdinal)
  }

  const events = ordered.map<TargetResolvedEvent>((event, resolvedPosition) => {
    const resolved: TargetResolvedEvent = {
      eventId: event.id,
      resolvedPosition,
      title: event.title,
      ...resolveTimes(event, mode),
    }
    const ordinal = locationOrdinalByEventId.get(event.id)
    if (ordinal !== undefined) resolved.locationOrdinal = ordinal
    if (event.type === "TRANSIT") {
      const useActualEndpoints = mode !== "PLANNER" && hasActualValue(event)
      const fromEventId = useActualEndpoints
        ? (event.detail.actualFromEventId ?? event.detail.plannedFromEventId)
        : event.detail.plannedFromEventId
      const toEventId = useActualEndpoints
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
