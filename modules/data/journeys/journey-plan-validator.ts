import { createHash } from "node:crypto"
import {
  dateTimeToTimestamp,
  planValidationReportSchema,
  type PlanValidationIssue,
  type PlanValidationReport,
  type TargetJourneyEvent,
  type TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import { resolveJourneyProjection } from "./journey-projection"

interface ValidateJourneyPlanInput {
  graph: TargetJourneyGraphSnapshot
  workspaceRevision: number
}

type TransitEvent = Extract<TargetJourneyEvent, { type: "TRANSIT" }>
type LocationEvent = Extract<
  TargetJourneyEvent,
  { type: "VISIT" | "STAY" | "MEAL" | "ACTIVITY" }
>
type CityEvent = Extract<TargetJourneyEvent, { type: "SECTION" }> & {
  detail: Extract<
    Extract<TargetJourneyEvent, { type: "SECTION" }>["detail"],
    { kind: "CITY" }
  >
}

type PlanIssueInput = Omit<
  PlanValidationIssue,
  "severity" | "path" | "suggestion"
> & {
  path?: string
  suggestion?: string
}

function issue(
  input: PlanIssueInput,
  severity: PlanValidationIssue["severity"] = "ERROR"
): PlanValidationIssue {
  return {
    ...input,
    severity,
    path: input.path ?? input.eventIds[0] ?? "graph",
    suggestion:
      input.suggestion ??
      `Allowed operations: ${input.allowedOperations.join(", ")}`,
  }
}

const LOCATION_TYPES = new Set(["VISIT", "STAY", "MEAL", "ACTIVITY"])

function isLocationEvent(event: TargetJourneyEvent): event is LocationEvent {
  return LOCATION_TYPES.has(event.type)
}

function activeLink(
  graph: TargetJourneyGraphSnapshot,
  fromEventId: string,
  toEventId: string
) {
  return graph.links.some(
    (link) =>
      link.fromEventId === fromEventId &&
      link.toEventId === toEventId &&
      link.introducedRevision <= graph.revision &&
      (!link.retiredRevision || link.retiredRevision > graph.revision)
  )
}

function localDate(instant: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant))
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )
  return `${values.year}-${values.month}-${values.day}`
}

function validTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format()
    return true
  } catch {
    return false
  }
}

function readyTransitIssue(
  transit: TransitEvent,
  cityEventId?: string,
  date?: string
): PlanValidationIssue | null {
  if (transit.detail.routeState === "READY") return null
  return issue({
    code: "TRANSIT_ROUTE_NOT_READY",
    cityEventId,
    localDate: date,
    eventIds: [transit.id],
    message: `Transit ${transit.id} has no selected route`,
    repairability: "RETRY_EXTERNAL",
    allowedOperations: ["journey.plan_transit"],
  })
}

function endpointIssue(
  graph: TargetJourneyGraphSnapshot,
  transit: TransitEvent,
  fromEventId: string,
  toEventId: string,
  cityEventId?: string,
  date?: string
): PlanValidationIssue | null {
  if (
    transit.detail.plannedFromEventId === fromEventId &&
    transit.detail.plannedToEventId === toEventId &&
    activeLink(graph, fromEventId, transit.id) &&
    activeLink(graph, transit.id, toEventId)
  ) {
    return null
  }
  return issue({
    code: "TRANSIT_ENDPOINT_MISMATCH",
    cityEventId,
    localDate: date,
    eventIds: [fromEventId, transit.id, toEventId],
    message: `Transit ${transit.id} does not connect its adjacent route events`,
    repairability: "AGENT",
    allowedOperations: ["journey.update_event", "journey.add_link"],
  })
}

export function validateJourneyPlan({
  graph,
  workspaceRevision,
}: ValidateJourneyPlanInput): PlanValidationReport {
  const issues: PlanValidationIssue[] = []
  const eventById = new Map(graph.events.map((event) => [event.id, event]))
  const projections: Record<string, string[]> = {}

  for (const link of graph.links) {
    if (
      link.introducedRevision > graph.revision ||
      (link.retiredRevision != null && link.retiredRevision <= graph.revision)
    ) {
      continue
    }
    const from = eventById.get(link.fromEventId)
    const to = eventById.get(link.toEventId)
    if (!from || !to || from.parentSectionEventId === to.parentSectionEventId) {
      continue
    }
    issues.push(
      issue({
        code: "CROSS_CITY_CONNECTION",
        eventIds: [from.id, to.id],
        message: `Link ${link.id} crosses City Scopes without a root Transit`,
        repairability: "AGENT",
        allowedOperations: ["journey.retire_link", "journey.add_link"],
        path: link.id,
        suggestion:
          "Keep City-internal links inside one City Scope; connect Cities only in the root chain through TRANSIT.",
      })
    )
  }

  const project = (scopeSectionEventId: string | null) => {
    try {
      const projection = resolveJourneyProjection({
        graph,
        scopeSectionEventId,
        mode: "PLANNER",
      })
      const eventIds = projection.events.map((event) => event.eventId)
      projections[scopeSectionEventId ?? "root"] = eventIds
      return eventIds
        .map((eventId) => eventById.get(eventId))
        .filter((event): event is TargetJourneyEvent => Boolean(event))
    } catch (error) {
      issues.push(
        issue({
          code: "PROJECTION_INVALID",
          cityEventId: scopeSectionEventId ?? undefined,
          eventIds: scopeSectionEventId ? [scopeSectionEventId] : [],
          message: error instanceof Error ? error.message : "Projection failed",
          repairability: "AGENT",
          allowedOperations: [
            "journey.add_link",
            "journey.retire_link",
            "journey.select_branch",
          ],
        })
      )
      return []
    }
  }

  const root = project(null)
  const cities: CityEvent[] = []
  if (root.length === 0) {
    issues.push(
      issue({
        code: "ROOT_ROUTE_DISCONNECTED",
        eventIds: [],
        message: "Root Scope must contain at least one CITY",
        repairability: "AGENT",
        allowedOperations: ["journey.add_event"],
      })
    )
  } else if (root.length % 2 === 0) {
    issues.push(
      issue({
        code: "ROOT_ROUTE_DISCONNECTED",
        eventIds: [root.at(-1)!.id],
        message: "Root Scope must end with CITY",
        repairability: "AGENT",
        allowedOperations: ["journey.add_event", "journey.add_link"],
      })
    )
  }

  root.forEach((event, index) => {
    const isCity = event.type === "SECTION" && event.detail.kind === "CITY"
    const expectedCity = index % 2 === 0
    if (!isCity && event.type !== "TRANSIT") {
      issues.push(
        issue({
          code: "ROOT_EVENT_TYPE_INVALID",
          eventIds: [event.id],
          message: `Root event ${event.id} must be CITY or TRANSIT`,
          repairability: "AGENT",
          allowedOperations: ["journey.move_event", "journey.retire_event"],
        })
      )
      return
    }
    if (expectedCity !== isCity) {
      issues.push(
        issue({
          code: "ROOT_ROUTE_DISCONNECTED",
          eventIds: [event.id],
          message: "Root Scope must alternate CITY and TRANSIT",
          repairability: "AGENT",
          allowedOperations: ["journey.add_event", "journey.add_link"],
        })
      )
      return
    }
    if (isCity) cities.push(event as CityEvent)
  })

  for (let index = 1; index < root.length; index += 2) {
    const transit = root[index]
    const from = root[index - 1]
    const to = root[index + 1]
    if (!transit || transit.type !== "TRANSIT" || !from || !to) continue
    const endpoint = endpointIssue(graph, transit, from.id, to.id)
    if (endpoint) issues.push(endpoint)
    const readiness = readyTransitIssue(transit)
    if (readiness) issues.push(readiness)
  }

  for (const city of cities) {
    const timeZone = city.detail.timeZone
    if (!validTimeZone(timeZone)) {
      issues.push(
        issue({
          code: "CITY_TIMEZONE_INVALID",
          cityEventId: city.id,
          eventIds: [city.id],
          message: `CITY ${city.id} must use a valid IANA time zone`,
          repairability: "AGENT",
          allowedOperations: ["journey.update_event"],
        })
      )
      continue
    }

    const route = project(city.id)
    if (route.length === 0) {
      issues.push(
        issue({
          code: "CITY_ROUTE_EMPTY",
          cityEventId: city.id,
          eventIds: [city.id],
          message: `CITY ${city.id} has no planned events`,
          repairability: "AGENT",
          allowedOperations: ["journey.add_event"],
        })
      )
      continue
    }

    const datedLocations: Array<{
      event: LocationEvent
      index: number
      date: string
    }> = []

    route.forEach((event, index) => {
      if (!isLocationEvent(event) && event.type !== "TRANSIT") {
        issues.push(
          issue({
            code: "CITY_EVENT_TYPE_INVALID",
            cityEventId: city.id,
            eventIds: [event.id],
            message: `City event ${event.id} must be a place, stay, activity, meal, or Transit`,
            repairability: "AGENT",
            allowedOperations: ["journey.move_event", "journey.retire_event"],
          })
        )
        return
      }
      if (event.type === "TRANSIT") {
        const readiness = readyTransitIssue(event, city.id)
        if (readiness) issues.push(readiness)
        const from = route.slice(0, index).reverse().find(isLocationEvent)
        const to = route.slice(index + 1).find(isLocationEvent)
        if (!from || !to) {
          issues.push(
            issue({
              code: "TRANSIT_ENDPOINT_MISMATCH",
              cityEventId: city.id,
              eventIds: [event.id],
              message: `Transit ${event.id} must sit between two place events`,
              repairability: "AGENT",
              allowedOperations: [
                "journey.move_event",
                "journey.update_event",
                "journey.add_link",
              ],
            })
          )
        } else {
          const endpoint = endpointIssue(graph, event, from.id, to.id, city.id)
          if (endpoint) issues.push(endpoint)
        }
        return
      }
      if (!event.plannedStartAt) {
        issues.push(
          issue({
            code: "PLANNED_START_MISSING",
            cityEventId: city.id,
            eventIds: [event.id],
            message: `Event ${event.id} needs plannedStartAt for local-day grouping`,
            repairability: "AGENT",
            allowedOperations: ["journey.update_event"],
          })
        )
        return
      }
      datedLocations.push({
        event,
        index,
        date: localDate(event.plannedStartAt, timeZone),
      })
      if (event.type === "VISIT" && !event.detail.providerCoverImage) {
        issues.push(
          issue(
            {
              code: "IMAGE_UNAVAILABLE",
              cityEventId: city.id,
              eventIds: [event.id],
              message: `Visit ${event.id} has no provider image`,
              repairability: "RETRY_EXTERNAL",
              allowedOperations: ["place.enrich"],
              suggestion:
                "Optionally enrich the resolved place image; a missing image does not block this plan.",
            },
            "WARNING"
          )
        )
      }
    })

    for (let index = 1; index < datedLocations.length; index += 1) {
      const previous = datedLocations[index - 1]!
      const current = datedLocations[index]!
      if (
        dateTimeToTimestamp(current.event.plannedStartAt!) <
        dateTimeToTimestamp(previous.event.plannedStartAt!)
      ) {
        issues.push(
          issue({
            code: "TIME_ORDER_INVALID",
            cityEventId: city.id,
            eventIds: [previous.event.id, current.event.id],
            message: "Route order moves backwards in time",
            repairability: "AGENT",
            allowedOperations: ["journey.update_event", "journey.move_event"],
            path: current.event.id,
            suggestion:
              "Move the later event after its predecessor or assign a later plannedStartAt.",
          })
        )
      }
      const transits = route
        .slice(previous.index + 1, current.index)
        .filter((event): event is TransitEvent => event.type === "TRANSIT")
      if (transits.length === 0) {
        issues.push(
          issue({
            code: "MISSING_TRANSIT_BETWEEN",
            cityEventId: city.id,
            localDate: previous.date,
            eventIds: [previous.event.id, current.event.id],
            message: "Adjacent places must be connected by Transit",
            repairability: "AGENT",
            allowedOperations: [
              "journey.add_event",
              "journey.add_link",
              "journey.plan_transit",
            ],
          })
        )
      }
    }
  }

  const projectionHash = createHash("sha256")
    .update(
      JSON.stringify({
        workspaceRevision,
        journeyRevision: graph.revision,
        projections,
        events: graph.events,
        links: graph.links,
        transitPlanningRuns: graph.transitPlanningRuns,
      })
    )
    .digest("hex")

  return planValidationReportSchema.parse({
    valid: issues.every((issue) => issue.severity !== "ERROR"),
    workspaceRevision,
    journeyRevision: graph.revision,
    projectionHash,
    issues,
  })
}
