import { projectMainSequence } from "./graph"
import { isLocationEvent } from "./locations"
import type {
  JourneyDocument,
  JourneyEvent,
  LocationJourneyEvent,
  SectionEvent,
  TransitEvent,
} from "@/types/journey"

export type JourneyViewLevel = "overview" | "section"

export interface JourneyScopeProjection {
  level: JourneyViewLevel
  title: string
  section: SectionEvent | null
  events: JourneyEvent[]
  locations: LocationJourneyEvent[]
  transits: TransitEvent[]
  isEmptySection: boolean
}

export function findSection(
  journey: Pick<JourneyDocument, "events">,
  sectionEventId: string
) {
  const event = journey.events.find(
    (candidate) => candidate.id === sectionEventId
  )
  return event?.type === "SECTION" ? event : null
}

export function getJourneyScopeProjection(
  journey: JourneyDocument | null,
  level: JourneyViewLevel,
  activeSectionEventId: string | null
): JourneyScopeProjection {
  if (!journey) {
    return {
      level: "overview",
      title: "行程预览",
      section: null,
      events: [],
      locations: [],
      transits: [],
      isEmptySection: false,
    }
  }

  const section =
    level === "section" && activeSectionEventId
      ? findSection(journey, activeSectionEventId)
      : null
  const events = projectMainSequence(journey, section?.id)
  return {
    level: section ? "section" : "overview",
    title: section?.title ?? journey.title,
    section,
    events,
    locations: events.filter(isLocationEvent),
    transits: events.filter(
      (event): event is TransitEvent => event.type === "TRANSIT"
    ),
    isEmptySection: Boolean(section && events.length === 0),
  }
}

export function executableEvents(events: readonly JourneyEvent[]) {
  return events.filter(
    (event) => event.type !== "SECTION" && event.type !== "NOTE"
  )
}
