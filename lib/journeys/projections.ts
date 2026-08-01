import { isLocationEvent } from "./locations"
import { resolveJourneyProjection } from "@/modules/data/journeys/journey-projection"
import type {
  TargetJourneyEvent,
  TargetJourneyGraphSnapshot,
  TargetResolvedEvent,
} from "@/modules/data-model/contracts"

export type JourneyViewLevel = "overview" | "section"
export type SectionEvent = Extract<TargetJourneyEvent, { type: "SECTION" }>
export type TransitEvent = Extract<TargetJourneyEvent, { type: "TRANSIT" }>
export type LocationEvent = Extract<
  TargetJourneyEvent,
  { type: "SECTION" | "VISIT" | "STAY" | "MEAL" | "ACTIVITY" }
>

export interface JourneyScopeItem {
  event: TargetJourneyEvent
  resolved: TargetResolvedEvent
}

export interface JourneyScopeProjection {
  level: JourneyViewLevel
  title: string
  section: SectionEvent | null
  items: JourneyScopeItem[]
  events: TargetJourneyEvent[]
  resolvedEvents: TargetResolvedEvent[]
  locations: LocationEvent[]
  transits: TransitEvent[]
  isEmptySection: boolean
}

const projectionCache = new WeakMap<
  TargetJourneyGraphSnapshot,
  Map<string, JourneyScopeProjection>
>()

export function findSection(
  graph: Pick<TargetJourneyGraphSnapshot, "events">,
  sectionEventId: string
) {
  const event = graph.events.find(
    (candidate) => candidate.id === sectionEventId
  )
  return event?.type === "SECTION" ? event : null
}

export function getJourneyScopeProjection(
  graph: TargetJourneyGraphSnapshot | null,
  level: JourneyViewLevel,
  activeSectionEventId: string | null
): JourneyScopeProjection {
  if (!graph) {
    return {
      level: "overview",
      title: "行程预览",
      section: null,
      items: [],
      events: [],
      resolvedEvents: [],
      locations: [],
      transits: [],
      isEmptySection: false,
    }
  }

  const cacheKey = `${level}:${activeSectionEventId ?? "root"}`
  const cached = projectionCache.get(graph)?.get(cacheKey)
  if (cached) return cached

  const section =
    level === "section" && activeSectionEventId
      ? findSection(graph, activeSectionEventId)
      : null
  const projection = resolveJourneyProjection({
    graph,
    scopeSectionEventId: section?.id ?? null,
    mode: "PLANNER",
  })
  const eventById = new Map(graph.events.map((event) => [event.id, event]))
  const items = projection.events.flatMap((resolved) => {
    const event = eventById.get(resolved.eventId)
    return event ? [{ event, resolved }] : []
  })
  const events = items.map((item) => item.event)
  const view: JourneyScopeProjection = {
    level: section ? "section" : "overview",
    title: section?.title ?? graph.title,
    section,
    items,
    events,
    resolvedEvents: projection.events,
    locations: events.filter(isLocationEvent),
    transits: events.filter(
      (event): event is TransitEvent => event.type === "TRANSIT"
    ),
    isEmptySection: Boolean(section && events.length === 0),
  }
  const graphCache = projectionCache.get(graph) ?? new Map()
  graphCache.set(cacheKey, view)
  projectionCache.set(graph, graphCache)
  return view
}

export function executableEvents(events: readonly TargetJourneyEvent[]) {
  return events.filter(
    (event) => event.type !== "SECTION" && event.type !== "NOTE"
  )
}
