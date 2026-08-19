import {
  dateTimeToTimestamp,
  targetJourneyGraphSnapshotSchema,
  type TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"

export class JourneyGraphValidationError extends Error {
  constructor(
    message: string,
    public readonly issues: readonly string[] = [message]
  ) {
    super(message)
    this.name = "JourneyGraphValidationError"
  }
}

function fail(...issues: string[]): never {
  throw new JourneyGraphValidationError(issues.join("; "), issues)
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assertAppendOnly<T extends { id: string }>(
  label: string,
  before: readonly T[],
  after: readonly T[]
) {
  const afterById = new Map(after.map((value) => [value.id, value]))
  for (const value of before) {
    const current = afterById.get(value.id)
    if (!current) fail(`${label} ${value.id} cannot be removed`)
    if (!sameValue(value, current)) {
      fail(`${label} ${value.id} is append-only`)
    }
  }
}

export type StructuredBranchIssue = {
  code: "INVALID_BRANCH_KEY" | "NON_CONVERGENT_BRANCH" | "CROSSING_BRANCH"
  message: string
}

function structuredBranchIssueForScope(
  events: readonly TargetJourneyGraphSnapshot["events"][number][],
  links: readonly TargetJourneyGraphSnapshot["links"][number][]
): StructuredBranchIssue | null {
  const incoming = new Map(events.map((event) => [event.id, 0]))
  const outgoing = new Map(
    events.map((event) => [event.id, [] as (typeof links)[number][]])
  )
  for (const link of links) {
    incoming.set(link.toEventId, (incoming.get(link.toEventId) ?? 0) + 1)
    outgoing.get(link.fromEventId)?.push(link)
  }
  for (const values of outgoing.values()) {
    values.sort(
      (left, right) => left.rank - right.rank || left.id.localeCompare(right.id)
    )
  }

  const branchGroups = new Map<string, (typeof links)[number][]>()
  for (const link of links) {
    if (link.kind !== "ALTERNATIVE" || !link.branchKey) continue
    const group = branchGroups.get(link.branchKey) ?? []
    group.push(link)
    branchGroups.set(link.branchKey, group)
  }
  for (const [branchKey, group] of branchGroups) {
    const groupIncoming = new Map<string, number>()
    const groupOutgoing = new Map<string, (typeof links)[number][]>()
    for (const link of group) {
      groupIncoming.set(
        link.toEventId,
        (groupIncoming.get(link.toEventId) ?? 0) + 1
      )
      const values = groupOutgoing.get(link.fromEventId) ?? []
      values.push(link)
      groupOutgoing.set(link.fromEventId, values)
    }
    const starts = group
      .map((link) => link.fromEventId)
      .filter((eventId) => !groupIncoming.has(eventId))
    const ends = group
      .map((link) => link.toEventId)
      .filter((eventId) => !groupOutgoing.has(eventId))
    if (
      [...groupIncoming.values()].some((count) => count > 1) ||
      [...groupOutgoing.values()].some((values) => values.length > 1) ||
      new Set(starts).size !== 1 ||
      new Set(ends).size !== 1 ||
      (outgoing.get(starts[0]!)?.length ?? 0) < 2 ||
      (incoming.get(ends[0]!) ?? 0) < 2
    ) {
      return {
        code: "INVALID_BRANCH_KEY",
        message: `alternative branch ${branchKey} must form one continuous path between one fork and one join`,
      }
    }
    const visited = new Set<string>()
    let cursor: string | undefined = starts[0]
    while (cursor) {
      const next: (typeof links)[number] | undefined =
        groupOutgoing.get(cursor)?.[0]
      if (!next || visited.has(next.id)) break
      visited.add(next.id)
      cursor = next.toEventId
    }
    if (visited.size !== group.length || cursor !== ends[0]) {
      return {
        code: "INVALID_BRANCH_KEY",
        message: `alternative branch ${branchKey} must keep one continuous key from fork to join`,
      }
    }
  }

  const indegree = new Map(incoming)
  const ready = events
    .filter((event) => indegree.get(event.id) === 0)
    .map((event) => event.id)
    .sort()
  const ordered: string[] = []
  while (ready.length) {
    const eventId = ready.shift()!
    ordered.push(eventId)
    for (const link of outgoing.get(eventId) ?? []) {
      const next = (indegree.get(link.toEventId) ?? 0) - 1
      indegree.set(link.toEventId, next)
      if (next === 0) {
        ready.push(link.toEventId)
        ready.sort()
      }
    }
  }
  if (ordered.length !== events.length) return null
  const position = new Map(ordered.map((eventId, index) => [eventId, index]))
  const reachableFrom = (startEventId: string) => {
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
  const intervals: Array<{
    forkEventId: string
    joinEventId: string
    start: number
    end: number
  }> = []
  for (const event of events) {
    const branches = outgoing.get(event.id) ?? []
    if (branches.length < 2) continue
    const reachable = branches.map((link) => reachableFrom(link.toEventId))
    const common = [...reachable[0]!]
      .filter((eventId) => reachable.every((values) => values.has(eventId)))
      .sort(
        (left, right) =>
          (position.get(left) ?? Number.MAX_SAFE_INTEGER) -
            (position.get(right) ?? Number.MAX_SAFE_INTEGER) ||
          left.localeCompare(right)
      )
    const joinEventId = common[0]
    if (!joinEventId) {
      return {
        code: "NON_CONVERGENT_BRANCH",
        message: `fork ${event.id} has no common downstream join`,
      }
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
      if (
        (left.start < right.start &&
          right.start < left.end &&
          left.end < right.end) ||
        (right.start < left.start &&
          left.start < right.end &&
          right.end < left.end)
      ) {
        return {
          code: "CROSSING_BRANCH",
          message: `branch intervals ${left.forkEventId}→${left.joinEventId} and ${right.forkEventId}→${right.joinEventId} cross`,
        }
      }
    }
  }
  return null
}

export function findStructuredBranchIssue(
  graph: TargetJourneyGraphSnapshot
): StructuredBranchIssue | null {
  const activeEvents = graph.events.filter(
    (event) => !event.retiredRevision && event.placementStatus === "SCHEDULED"
  )
  const activeLinks = graph.links.filter((link) => !link.retiredRevision)
  const scopes = new Set(
    activeEvents.map((event) => event.parentSectionEventId)
  )
  for (const scope of scopes) {
    const scopedEvents = activeEvents.filter(
      (event) => event.parentSectionEventId === scope
    )
    const scopedIds = new Set(scopedEvents.map((event) => event.id))
    const issue = structuredBranchIssueForScope(
      scopedEvents,
      activeLinks.filter(
        (link) =>
          scopedIds.has(link.fromEventId) && scopedIds.has(link.toEventId)
      )
    )
    if (issue) return issue
  }
  return null
}

function assertActiveTopology(graph: TargetJourneyGraphSnapshot) {
  const activeEvents = graph.events.filter(
    (event) => !event.retiredRevision && event.placementStatus === "SCHEDULED"
  )
  const activeEventIds = new Set(activeEvents.map((event) => event.id))
  const activeLinks = graph.links.filter((link) => !link.retiredRevision)
  const mainFrom = new Set<string>()
  const mainTo = new Set<string>()
  const outgoing = new Map<string, string[]>()
  const neighbours = new Map<string, Set<string>>()

  for (const event of activeEvents) {
    outgoing.set(event.id, [])
    neighbours.set(event.id, new Set())
  }

  for (const link of activeLinks) {
    if (link.fromEventId === link.toEventId) {
      fail(`active Link ${link.id} cannot reference the same endpoint twice`)
    }
    if (link.kind === "MAIN") {
      if (link.branchKey !== undefined) {
        fail(`MAIN Link ${link.id} cannot carry branchKey`)
      }
      if (mainFrom.has(link.fromEventId)) {
        fail(`Event ${link.fromEventId} has multiple active MAIN outputs`)
      }
      if (mainTo.has(link.toEventId)) {
        fail(`Event ${link.toEventId} has multiple active MAIN inputs`)
      }
      mainFrom.add(link.fromEventId)
      mainTo.add(link.toEventId)
    } else if (!link.branchKey) {
      fail(`ALTERNATIVE Link ${link.id} requires branchKey`)
    }

    outgoing.get(link.fromEventId)?.push(link.toEventId)
    neighbours.get(link.fromEventId)?.add(link.toEventId)
    neighbours.get(link.toEventId)?.add(link.fromEventId)
  }

  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (eventId: string) => {
    if (visiting.has(eventId)) {
      fail(`active topology contains a cycle at Event ${eventId}`)
    }
    if (visited.has(eventId)) return
    visiting.add(eventId)
    for (const targetId of outgoing.get(eventId) ?? []) visit(targetId)
    visiting.delete(eventId)
    visited.add(eventId)
  }
  for (const event of activeEvents) visit(event.id)

  const eventsByScope = new Map<string | null, string[]>()
  for (const event of activeEvents) {
    const scoped = eventsByScope.get(event.parentSectionEventId) ?? []
    scoped.push(event.id)
    eventsByScope.set(event.parentSectionEventId, scoped)
  }
  for (const [scope, eventIds] of eventsByScope) {
    if (eventIds.length < 2) continue
    const seen = new Set<string>()
    const stack = [eventIds[0]!]
    while (stack.length) {
      const eventId = stack.pop()!
      if (seen.has(eventId)) continue
      seen.add(eventId)
      for (const next of neighbours.get(eventId) ?? []) {
        if (activeEventIds.has(next)) stack.push(next)
      }
    }
    const disconnected = eventIds.filter((eventId) => !seen.has(eventId))
    if (disconnected.length) {
      fail(
        `active scope ${scope ?? "<root>"} is disconnected at Events ${disconnected.join(", ")}`
      )
    }
  }
  const branchIssue = findStructuredBranchIssue(graph)
  if (branchIssue) fail(branchIssue.message)
}

export function validateJourneyGraph(
  input: unknown
): TargetJourneyGraphSnapshot {
  const parsed = targetJourneyGraphSnapshotSchema.safeParse(input)
  if (!parsed.success) {
    fail(
      ...parsed.error.issues.map(
        (issue) =>
          `${issue.path.length ? issue.path.join(".") : "graph"}: ${issue.message}`
      )
    )
  }
  const graph: TargetJourneyGraphSnapshot = {
    ...parsed.data,
    events: parsed.data.events.map((event) => ({
      ...event,
      retiredRevision: event.retiredRevision ?? undefined,
    })),
    links: parsed.data.links.map((link) => ({
      ...link,
      retiredRevision: link.retiredRevision ?? undefined,
    })),
  }
  assertActiveTopology(graph)
  return graph
}

export function validateJourneyGraphTransition(
  previousInput: TargetJourneyGraphSnapshot,
  input: unknown
): TargetJourneyGraphSnapshot {
  const previous = validateJourneyGraph(previousInput)
  const next = validateJourneyGraph(input)
  if (next.id !== previous.id) fail("Journey id is immutable")
  if (next.ownerId !== previous.ownerId) fail("Journey owner is immutable")
  if (next.revision !== previous.revision + 1) {
    fail(
      `Journey revision must advance from ${previous.revision} to ${previous.revision + 1}`
    )
  }

  const nextEvents = new Map(next.events.map((event) => [event.id, event]))
  for (const event of previous.events) {
    const current = nextEvents.get(event.id)
    if (!current) fail(`Event ${event.id} cannot be removed`)
    if (current.journeyId !== event.journeyId) {
      fail(`Event ${event.id} cannot change Journey`)
    }
    if (current.type !== event.type) {
      fail(`Event ${event.id} type is immutable; use replacement`)
    }
    if (current.origin !== event.origin) {
      fail(`Event ${event.id} origin is immutable`)
    }
    if (current.introducedRevision !== event.introducedRevision) {
      fail(`Event ${event.id} introducedRevision is immutable`)
    }
    if (current.createdAt !== event.createdAt) {
      fail(`Event ${event.id} createdAt is immutable`)
    }
    if (
      dateTimeToTimestamp(current.updatedAt) <
      dateTimeToTimestamp(event.updatedAt)
    ) {
      fail(`Event ${event.id} updatedAt cannot move backwards`)
    }
    if (
      current.retiredRevision !== event.retiredRevision &&
      event.retiredRevision !== undefined &&
      current.retiredRevision !== undefined
    ) {
      fail(`Event ${event.id} retiredRevision is immutable once recorded`)
    }
    if (
      current.retiredRevision !== event.retiredRevision &&
      event.retiredRevision === undefined &&
      current.retiredRevision !== next.revision
    ) {
      fail(`Event ${event.id} must retire at revision ${next.revision}`)
    }
  }
  const previousEventIds = new Set(previous.events.map((event) => event.id))
  for (const event of next.events) {
    if (
      !previousEventIds.has(event.id) &&
      event.introducedRevision !== next.revision
    ) {
      fail(
        `new Event ${event.id} must be introduced at revision ${next.revision}`
      )
    }
  }

  const nextLinks = new Map(next.links.map((link) => [link.id, link]))
  for (const link of previous.links) {
    const current = nextLinks.get(link.id)
    if (!current) fail(`Link ${link.id} cannot be removed`)
    if (current.journeyId !== link.journeyId) {
      fail(`Link ${link.id} cannot change Journey`)
    }
    if (current.introducedRevision !== link.introducedRevision) {
      fail(`Link ${link.id} introducedRevision is immutable`)
    }
    if (
      current.retiredRevision !== link.retiredRevision &&
      link.retiredRevision !== undefined &&
      current.retiredRevision !== undefined
    ) {
      fail(`Link ${link.id} retiredRevision is immutable once recorded`)
    }
    if (
      current.retiredRevision !== link.retiredRevision &&
      link.retiredRevision === undefined &&
      current.retiredRevision !== next.revision
    ) {
      fail(`Link ${link.id} must retire at revision ${next.revision}`)
    }
  }
  const previousLinkIds = new Set(previous.links.map((link) => link.id))
  for (const link of next.links) {
    if (
      !previousLinkIds.has(link.id) &&
      link.introducedRevision !== next.revision
    ) {
      fail(
        `new Link ${link.id} must be introduced at revision ${next.revision}`
      )
    }
  }

  assertAppendOnly("Replacement", previous.replacements, next.replacements)
  const previousReplacementIds = new Set(
    previous.replacements.map((replacement) => replacement.id)
  )
  for (const replacement of next.replacements.filter(
    (replacement) => !previousReplacementIds.has(replacement.id)
  )) {
    if (replacement.revision !== next.revision) {
      fail(
        `new Replacement ${replacement.id} must be recorded at revision ${next.revision}`
      )
    }
  }

  assertAppendOnly(
    "BranchSelection",
    previous.branchSelections,
    next.branchSelections
  )
  const previousSelectionIds = new Set(
    previous.branchSelections.map((selection) => selection.id)
  )
  for (const selection of next.branchSelections.filter(
    (selection) => !previousSelectionIds.has(selection.id)
  )) {
    if (selection.journeyRevision !== next.revision) {
      fail(
        `new BranchSelection ${selection.id} must be recorded at revision ${next.revision}`
      )
    }
  }

  assertAppendOnly(
    "TransitPlanningRun",
    previous.transitPlanningRuns,
    next.transitPlanningRuns
  )
  assertAppendOnly("EventObservation", previous.observations, next.observations)

  return next
}
