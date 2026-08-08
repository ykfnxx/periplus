import { describe, expect, it } from "vitest"
import type {
  TargetJourneyEvent,
  TargetJourneyEventLink,
  TargetJourneyGraphSnapshot,
} from "@/modules/data-model/contracts"
import { validateJourneyPlan } from "@/modules/data/journeys/journey-plan-validator"

const NOW = "2026-08-01T01:00:00.000Z"

function identity(id: string, parentSectionEventId: string | null) {
  return {
    id,
    journeyId: "journey-plan",
    parentSectionEventId,
    placementStatus: "SCHEDULED" as const,
    origin: "ORIGINAL" as const,
    introducedRevision: 1,
    createdAt: NOW,
    updatedAt: NOW,
  }
}

function city(timeZone = "Asia/Shanghai", id = "city"): TargetJourneyEvent {
  return {
    ...identity(id, null),
    type: "SECTION",
    title: "西安",
    detail: {
      kind: "CITY",
      timeZone,
      lat: 34.3416,
      lng: 108.9398,
      coordinateSystem: "GCJ02",
    },
  }
}

function visit(
  id: string,
  plannedStartAt: string,
  parentSectionEventId = "city"
): TargetJourneyEvent {
  return {
    ...identity(id, parentSectionEventId),
    type: "VISIT",
    executionStatus: "PLANNED",
    title: id,
    plannedStartAt,
    detail: {
      plannedLat: 34.34,
      plannedLng: 108.94,
      coordinateSystem: "GCJ02",
    },
  }
}

function transit(fromEventId: string, toEventId: string): TargetJourneyEvent {
  return {
    ...identity("transit", "city"),
    type: "TRANSIT",
    executionStatus: "PLANNED",
    title: "市内交通",
    detail: {
      plannedFromEventId: fromEventId,
      plannedToEventId: toEventId,
      transportMode: "CAR",
      routeState: "EMPTY",
    },
  }
}

function link(
  id: string,
  fromEventId: string,
  toEventId: string,
  rank: number
): TargetJourneyEventLink {
  return {
    id,
    journeyId: "journey-plan",
    fromEventId,
    toEventId,
    kind: "MAIN",
    rank,
    introducedRevision: 1,
  }
}

function graph(
  events: TargetJourneyEvent[],
  links: TargetJourneyEventLink[] = []
): TargetJourneyGraphSnapshot {
  return {
    id: "journey-plan",
    ownerId: "owner",
    revision: 1,
    status: "DRAFT",
    visibility: "PRIVATE",
    title: "西安行程",
    events,
    links,
    replacements: [],
    branchSelections: [],
    transitPlanningRuns: [],
    eventAssetLinks: [],
    observations: [],
    eventSourceLinks: [],
  }
}

describe("validateJourneyPlan", () => {
  it("accepts one City Scope with a dated place", () => {
    const report = validateJourneyPlan({
      graph: graph([city(), visit("wall", NOW)]),
      workspaceRevision: 3,
    })

    expect(report).toMatchObject({ valid: true, workspaceRevision: 3 })
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "IMAGE_UNAVAILABLE",
        severity: "WARNING",
        eventIds: ["wall"],
      })
    )
  })

  it("rejects a non-CITY root event", () => {
    const rootVisit: TargetJourneyEvent = {
      ...visit("wall", NOW),
      parentSectionEventId: null,
    }
    const report = validateJourneyPlan({
      graph: graph([rootVisit]),
      workspaceRevision: 0,
    })

    expect(report.valid).toBe(false)
    expect(report.issues.map((issue) => issue.code)).toContain(
      "ROOT_EVENT_TYPE_INVALID"
    )
  })

  it("requires Transit between same-day places", () => {
    const report = validateJourneyPlan({
      graph: graph(
        [
          city(),
          visit("wall", "2026-08-01T01:00:00.000Z"),
          visit("meal", "2026-08-01T04:00:00.000Z"),
        ],
        [link("direct", "wall", "meal", 0)]
      ),
      workspaceRevision: 2,
    })

    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "MISSING_TRANSIT_BETWEEN",
        localDate: "2026-08-01",
        eventIds: ["wall", "meal"],
      })
    )
  })

  it("allows the backend-derived day boundary without Transit", () => {
    const report = validateJourneyPlan({
      graph: graph(
        [
          city(),
          visit("day-one", "2026-08-01T01:00:00.000Z"),
          visit("day-two", "2026-08-02T01:00:00.000Z"),
        ],
        [link("day-boundary", "day-one", "day-two", 0)]
      ),
      workspaceRevision: 2,
    })

    expect(report.valid).toBe(true)
  })

  it("accepts provider-backed stays while rejecting unplanned Transit routes", () => {
    const stay: TargetJourneyEvent = {
      ...identity("stay", "city"),
      type: "STAY",
      executionStatus: "PLANNED",
      title: "酒店",
      plannedStartAt: NOW,
      detail: {
        plannedLat: 34.34,
        plannedLng: 108.94,
        coordinateSystem: "GCJ02",
      },
    }
    const report = validateJourneyPlan({
      graph: graph(
        [
          city(),
          visit("wall", "2026-08-01T01:00:00.000Z"),
          transit("wall", "meal"),
          visit("meal", "2026-08-01T04:00:00.000Z"),
          stay,
        ],
        [
          link("before-transit", "wall", "transit", 0),
          link("after-transit", "transit", "meal", 1),
          link("after-meal", "meal", "stay", 2),
        ]
      ),
      workspaceRevision: 4,
    })

    expect(report.issues.map((issue) => issue.code)).toContain(
      "TRANSIT_ROUTE_NOT_READY"
    )
    expect(report.issues.map((issue) => issue.code)).not.toContain(
      "STAY_NOT_SUPPORTED"
    )
  })

  it("rejects a non-IANA City timezone", () => {
    const report = validateJourneyPlan({
      graph: graph([city("Shanghai time"), visit("wall", NOW)]),
      workspaceRevision: 1,
    })

    expect(report.issues.map((issue) => issue.code)).toContain(
      "CITY_TIMEZONE_INVALID"
    )
  })

  it("reports route time moving backwards as a repairable draft error", () => {
    const report = validateJourneyPlan({
      graph: graph(
        [
          city(),
          visit("later", "2026-08-01T04:00:00.000Z"),
          visit("earlier", "2026-08-01T01:00:00.000Z"),
        ],
        [link("backwards", "later", "earlier", 0)]
      ),
      workspaceRevision: 2,
    })

    expect(report).toMatchObject({ valid: false })
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "TIME_ORDER_INVALID",
        eventIds: ["later", "earlier"],
        allowedOperations: ["journey.update_event", "journey.move_event"],
      })
    )
  })

  it("reports a link that crosses City Scopes", () => {
    const report = validateJourneyPlan({
      graph: graph(
        [
          city("Asia/Shanghai", "city-a"),
          city("Asia/Shanghai", "city-b"),
          visit("a-visit", NOW, "city-a"),
          visit("b-visit", NOW, "city-b"),
        ],
        [
          link("root", "city-a", "city-b", 0),
          link("cross-city", "a-visit", "b-visit", 1),
        ]
      ),
      workspaceRevision: 2,
    })

    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "CROSS_CITY_CONNECTION",
        path: "cross-city",
        eventIds: ["a-visit", "b-visit"],
      })
    )
  })
})
