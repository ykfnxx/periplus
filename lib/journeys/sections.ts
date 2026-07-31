import type {
  JourneyDocument,
  JourneyEvent,
  SectionEvent,
} from "@/types/journey"

const TIME_FIELDS = [
  "plannedStartAt",
  "plannedEndAt",
  "actualStartAt",
  "actualEndAt",
] as const

export function deriveSectionTimes<T extends JourneyDocument>(journey: T): T {
  const activeEvents = journey.events.filter(
    (event) => !event.replacedByEventId
  )
  const childrenByParent = new Map<string, JourneyEvent[]>()
  for (const event of activeEvents) {
    if (!event.parentEventId) continue
    const children = childrenByParent.get(event.parentEventId) ?? []
    children.push(event)
    childrenByParent.set(event.parentEventId, children)
  }

  const sections = activeEvents
    .filter((event): event is SectionEvent => event.type === "SECTION")
    .sort(
      (left, right) =>
        depth(right, journey.events) - depth(left, journey.events)
    )

  for (const section of sections) {
    const children = childrenByParent.get(section.id) ?? []
    if (!children.length) continue
    for (const field of TIME_FIELDS) {
      const values = children
        .map((child) => child[field])
        .filter((value): value is string => Boolean(value))
      const derived = field.endsWith("StartAt")
        ? earliest(values)
        : latest(values)
      if (derived) section[field] = derived
      else delete section[field]
    }
  }
  return journey
}

function depth(event: JourneyEvent, events: readonly JourneyEvent[]) {
  const byId = new Map(events.map((candidate) => [candidate.id, candidate]))
  let value = 0
  let parentId = event.parentEventId
  const seen = new Set<string>()
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    value += 1
    parentId = byId.get(parentId)?.parentEventId
  }
  return value
}

function earliest(values: string[]) {
  return values.reduce<string | undefined>((current, value) => {
    if (!current) return value
    return new Date(value).getTime() < new Date(current).getTime()
      ? value
      : current
  }, undefined)
}

function latest(values: string[]) {
  return values.reduce<string | undefined>((current, value) => {
    if (!current) return value
    return new Date(value).getTime() > new Date(current).getTime()
      ? value
      : current
  }, undefined)
}
