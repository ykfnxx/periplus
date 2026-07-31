import type {
  JourneyDocument,
  JourneyEvent,
  JourneyEventLink,
} from "@/types/journey"

export type JourneyGraphValidationResult =
  | { ok: true }
  | { ok: false; error: string }

const ROOT_SCOPE = "__root__"

function scopeId(parentEventId: string | undefined) {
  return parentEventId ?? ROOT_SCOPE
}

export function eventsInScope(
  journey: Pick<JourneyDocument, "events">,
  parentEventId?: string
) {
  const targetScope = scopeId(parentEventId)
  return journey.events.filter(
    (event) => scopeId(event.parentEventId) === targetScope
  )
}

export function mainLinksInScope(
  journey: Pick<JourneyDocument, "events" | "links">,
  parentEventId?: string
) {
  const eventIds = new Set(
    eventsInScope(journey, parentEventId)
      .filter((event) => !event.replacedByEventId)
      .map((event) => event.id)
  )
  return journey.links.filter(
    (link) =>
      link.kind === "MAIN" &&
      eventIds.has(link.fromEventId) &&
      eventIds.has(link.toEventId)
  )
}

export function linksInScope(
  journey: Pick<JourneyDocument, "events" | "links">,
  parentEventId?: string
) {
  const eventIds = new Set(
    eventsInScope(journey, parentEventId)
      .filter((event) => !event.replacedByEventId)
      .map((event) => event.id)
  )
  return journey.links.filter(
    (link) => eventIds.has(link.fromEventId) && eventIds.has(link.toEventId)
  )
}

export function projectMainSequence(
  journey: Pick<JourneyDocument, "events" | "links">,
  parentEventId?: string
): JourneyEvent[] {
  const events = eventsInScope(journey, parentEventId).filter(
    (event) => !event.replacedByEventId
  )
  if (events.length <= 1) return events

  const links = mainLinksInScope(journey, parentEventId)
  if (!links.length) return []
  const mainEventIds = new Set(
    links.flatMap((link) => [link.fromEventId, link.toEventId])
  )
  const mainEvents = events.filter((event) => mainEventIds.has(event.id))
  const incoming = new Set(links.map((link) => link.toEventId))
  const outgoing = new Map(links.map((link) => [link.fromEventId, link]))
  const roots = mainEvents.filter((event) => !incoming.has(event.id))
  if (roots.length !== 1) return []

  const byId = new Map(mainEvents.map((event) => [event.id, event]))
  const ordered: JourneyEvent[] = []
  const seen = new Set<string>()
  let current: JourneyEvent | undefined = roots[0]

  while (current && !seen.has(current.id)) {
    ordered.push(current)
    seen.add(current.id)
    const nextId: string | undefined = outgoing.get(current.id)?.toEventId
    current = nextId ? byId.get(nextId) : undefined
  }

  return ordered.length === mainEvents.length ? ordered : []
}

export function projectTopologicalSequence(
  journey: Pick<JourneyDocument, "events" | "links">,
  parentEventId?: string
): JourneyEvent[] {
  const events = eventsInScope(journey, parentEventId).filter(
    (event) => !event.replacedByEventId
  )
  if (events.length <= 1) return events

  const order = new Map(events.map((event, index) => [event.id, index]))
  const byId = new Map(events.map((event) => [event.id, event]))
  const incomingCount = new Map(events.map((event) => [event.id, 0]))
  const outgoing = new Map<string, string[]>()
  for (const link of linksInScope(journey, parentEventId)) {
    incomingCount.set(
      link.toEventId,
      (incomingCount.get(link.toEventId) ?? 0) + 1
    )
    const targets = outgoing.get(link.fromEventId) ?? []
    targets.push(link.toEventId)
    outgoing.set(link.fromEventId, targets)
  }

  const ready = events
    .filter((event) => incomingCount.get(event.id) === 0)
    .map((event) => event.id)
  const ordered: JourneyEvent[] = []
  while (ready.length) {
    ready.sort(
      (left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0)
    )
    const eventId = ready.shift()!
    const event = byId.get(eventId)
    if (!event) continue
    ordered.push(event)
    for (const targetId of outgoing.get(eventId) ?? []) {
      const remaining = (incomingCount.get(targetId) ?? 0) - 1
      incomingCount.set(targetId, remaining)
      if (remaining === 0) ready.push(targetId)
    }
  }

  return ordered.length === events.length ? ordered : []
}

export function findMainIncomingLink(
  links: readonly JourneyEventLink[],
  eventId: string
) {
  return links.find(
    (link) => link.kind === "MAIN" && link.toEventId === eventId
  )
}

export function findMainOutgoingLink(
  links: readonly JourneyEventLink[],
  eventId: string
) {
  return links.find(
    (link) => link.kind === "MAIN" && link.fromEventId === eventId
  )
}

export function descendantsOf(
  journey: Pick<JourneyDocument, "events">,
  eventId: string
) {
  const childrenByParent = new Map<string, JourneyEvent[]>()
  for (const event of journey.events) {
    if (!event.parentEventId) continue
    const children = childrenByParent.get(event.parentEventId) ?? []
    children.push(event)
    childrenByParent.set(event.parentEventId, children)
  }

  const descendants: JourneyEvent[] = []
  const pending = [...(childrenByParent.get(eventId) ?? [])]
  while (pending.length) {
    const event = pending.pop()
    if (!event) continue
    descendants.push(event)
    pending.push(...(childrenByParent.get(event.id) ?? []))
  }
  return descendants
}

export function validateJourneyGraph(
  journey: Pick<JourneyDocument, "events" | "links">
): JourneyGraphValidationResult {
  const eventById = new Map<string, JourneyEvent>()
  const journeyIds = new Set<string>()
  for (const event of journey.events) {
    const executionStatus = (
      event as JourneyEvent & { executionStatus?: string }
    ).executionStatus
    if (!event.id.trim()) return { ok: false, error: "event id is required" }
    if (eventById.has(event.id)) {
      return { ok: false, error: `duplicate event id ${event.id}` }
    }
    eventById.set(event.id, event)
    if (event.journeyId) journeyIds.add(event.journeyId)

    if (event.parentEventId === event.id) {
      return { ok: false, error: `event ${event.id} cannot parent itself` }
    }
    if (event.replacedByEventId === event.id) {
      return { ok: false, error: `event ${event.id} cannot replace itself` }
    }
    if (
      (event.type === "SECTION" || event.type === "NOTE") &&
      executionStatus !== undefined
    ) {
      return {
        ok: false,
        error: `${event.type} event ${event.id} cannot have execution status`,
      }
    }
    if (event.type !== "SECTION" && event.type !== "NOTE" && !executionStatus) {
      return {
        ok: false,
        error: `executable event ${event.id} requires execution status`,
      }
    }
  }
  for (const link of journey.links) {
    if (link.journeyId) journeyIds.add(link.journeyId)
  }
  if (journeyIds.size > 1) {
    return { ok: false, error: "journey graph contains mixed journeyId values" }
  }

  for (const event of journey.events) {
    if (event.parentEventId) {
      const parent = eventById.get(event.parentEventId)
      if (!parent) {
        return {
          ok: false,
          error: `event ${event.id} references unknown parent ${event.parentEventId}`,
        }
      }
      if (parent.type !== "SECTION") {
        return {
          ok: false,
          error: `event ${event.id} parent must be a SECTION`,
        }
      }
      if (parent.replacedByEventId) {
        return {
          ok: false,
          error: `event ${event.id} cannot use a replaced parent`,
        }
      }
    }
    if (event.replacedByEventId) {
      const replacement = eventById.get(event.replacedByEventId)
      if (!replacement) {
        return {
          ok: false,
          error: `event ${event.id} references unknown replacement ${event.replacedByEventId}`,
        }
      }
      if (scopeId(event.parentEventId) !== scopeId(replacement.parentEventId)) {
        return {
          ok: false,
          error: `event ${event.id} and its replacement must share parentEventId`,
        }
      }
    }
    if (event.type === "TRANSIT") {
      if (
        event.detail.selectedPlanId &&
        !event.detail.plans?.some(
          (plan) => plan.id === event.detail.selectedPlanId
        )
      ) {
        return {
          ok: false,
          error: `transit event ${event.id} selected plan is missing`,
        }
      }
      const endpointIds = [
        event.detail.plannedFromEventId,
        event.detail.plannedToEventId,
        event.detail.actualFromEventId,
        event.detail.actualToEventId,
      ].filter((value): value is string => Boolean(value))
      for (const endpointId of endpointIds) {
        const endpoint = eventById.get(endpointId)
        if (!endpoint) {
          return {
            ok: false,
            error: `transit event ${event.id} references unknown endpoint ${endpointId}`,
          }
        }
        if (scopeId(endpoint.parentEventId) !== scopeId(event.parentEventId)) {
          return {
            ok: false,
            error: `transit event ${event.id} endpoints must share its parentEventId`,
          }
        }
        if (!event.replacedByEventId && endpoint.replacedByEventId) {
          return {
            ok: false,
            error: `active transit event ${event.id} cannot reference a replaced endpoint`,
          }
        }
      }
    }

    const ancestors = new Set<string>([event.id])
    let parentId = event.parentEventId
    while (parentId) {
      if (ancestors.has(parentId)) {
        return { ok: false, error: `parent cycle includes event ${event.id}` }
      }
      ancestors.add(parentId)
      parentId = eventById.get(parentId)?.parentEventId
    }

    const replacements = new Set<string>([event.id])
    let replacementId = event.replacedByEventId
    while (replacementId) {
      if (replacements.has(replacementId)) {
        return {
          ok: false,
          error: `replacement cycle includes event ${event.id}`,
        }
      }
      replacements.add(replacementId)
      replacementId = eventById.get(replacementId)?.replacedByEventId
    }
  }

  const linkIds = new Set<string>()
  const mainIncoming = new Map<string, JourneyEventLink>()
  const mainOutgoing = new Map<string, JourneyEventLink>()
  for (const link of journey.links) {
    if (!link.id.trim()) return { ok: false, error: "link id is required" }
    if (linkIds.has(link.id)) {
      return { ok: false, error: `duplicate link id ${link.id}` }
    }
    linkIds.add(link.id)
    if (link.fromEventId === link.toEventId) {
      return { ok: false, error: `link ${link.id} cannot reference itself` }
    }

    const from = eventById.get(link.fromEventId)
    const to = eventById.get(link.toEventId)
    if (!from || !to) {
      return { ok: false, error: `link ${link.id} references unknown event` }
    }
    if (scopeId(from.parentEventId) !== scopeId(to.parentEventId)) {
      return {
        ok: false,
        error: `link ${link.id} endpoints must share parentEventId`,
      }
    }
    if (from.replacedByEventId || to.replacedByEventId) {
      return {
        ok: false,
        error: `link ${link.id} cannot reference a replaced event`,
      }
    }

    if (link.kind === "MAIN") {
      if (mainOutgoing.has(link.fromEventId)) {
        return {
          ok: false,
          error: `event ${link.fromEventId} has multiple MAIN outgoing links`,
        }
      }
      if (mainIncoming.has(link.toEventId)) {
        return {
          ok: false,
          error: `event ${link.toEventId} has multiple MAIN incoming links`,
        }
      }
      mainOutgoing.set(link.fromEventId, link)
      mainIncoming.set(link.toEventId, link)
    }
  }

  const scopes = new Set(
    journey.events.map((event) => scopeId(event.parentEventId))
  )
  for (const scope of scopes) {
    const parentEventId = scope === ROOT_SCOPE ? undefined : scope
    const scopedEvents = eventsInScope(journey, parentEventId).filter(
      (event) => !event.replacedByEventId
    )
    if (scopedEvents.length <= 1) continue

    const scopedLinks = linksInScope(journey, parentEventId)
    const topologicalSequence = projectTopologicalSequence(
      journey,
      parentEventId
    )
    if (topologicalSequence.length !== scopedEvents.length) {
      return {
        ok: false,
        error: `links in scope ${scope} must form an acyclic graph`,
      }
    }
    const incomingIds = new Set(scopedLinks.map((link) => link.toEventId))
    const roots = scopedEvents.filter((event) => !incomingIds.has(event.id))
    if (roots.length !== 1) {
      return {
        ok: false,
        error: `links in scope ${scope} must form one connected graph`,
      }
    }

    const mainLinks = mainLinksInScope(journey, parentEventId)
    const mainEventIds = new Set(
      mainLinks.flatMap((link) => [link.fromEventId, link.toEventId])
    )
    const mainSequence = projectMainSequence(journey, parentEventId)
    if (
      !mainLinks.length ||
      mainSequence.length !== mainEventIds.size ||
      mainSequence[0]?.id !== roots[0]?.id
    ) {
      return {
        ok: false,
        error: `MAIN links in scope ${scope} must form one acyclic root chain`,
      }
    }
  }

  return { ok: true }
}

export function assertValidJourneyGraph(
  journey: Pick<JourneyDocument, "events" | "links">
) {
  const result = validateJourneyGraph(journey)
  if (!result.ok) throw new Error(result.error)
}
