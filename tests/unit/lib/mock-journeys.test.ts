import { describe, expect, it } from "vitest"
import { createSilkRoadJourney } from "@/lib/mock-journeys"
import {
  getJourneyScopeProjection,
  getJourneyScopeTreeEvents,
} from "@/lib/journeys/projections"
import { locationCount } from "@/lib/journeys/summary"
import { buildTransitPlanRequest } from "@/lib/journeys/planning"
import { targetJourneyGraphSnapshotSchema } from "@/modules/data-model/contracts"

describe("Silk Road debug preset", () => {
  it("is a valid, complete multi-scope Journey graph", () => {
    const graph = createSilkRoadJourney({ id: "journey", ownerId: "owner" })

    expect(() => targetJourneyGraphSnapshotSchema.parse(graph)).not.toThrow()
    const overview = getJourneyScopeProjection(graph, "overview", null)
    expect(
      overview.events.filter(
        (event) => event.type === "SECTION" && event.detail.kind === "CITY"
      )
    ).toHaveLength(7)
    expect(
      overview.events.filter((event) => event.type === "TRANSIT")
    ).toHaveLength(6)
    expect(
      overview.events.filter(
        (event) =>
          event.type === "TRANSIT" && event.detail.routeState === "READY"
      )
    ).toHaveLength(0)
    expect(
      locationCount(getJourneyScopeTreeEvents(graph, "overview", null))
    ).toBe(30)
    expect(graph.transitPlanningRuns).toEqual([])
    for (const event of graph.events) {
      if (event.type !== "TRANSIT") continue
      const request = buildTransitPlanRequest(event, graph.events)
      expect(request).not.toBeNull()
      expect(event.detail).toMatchObject({ routeState: "EMPTY" })
      expect(event.detail.activePlanningRunId).toBeUndefined()
      expect(event.detail.selectedPlanId).toBeUndefined()
    }
  })

  it("covers all five event cards and leaves exact routes to the provider", () => {
    const graph = createSilkRoadJourney({ id: "journey", ownerId: "owner" })
    const xian = getJourneyScopeProjection(graph, "section", "section-xian")

    expect(new Set(xian.events.map((event) => event.type))).toEqual(
      new Set(["VISIT", "TRANSIT", "MEAL", "ACTIVITY", "STAY"])
    )
    const transit = xian.events.find((event) => event.id === "transit-xian-1")
    expect(transit?.type).toBe("TRANSIT")
    if (transit?.type !== "TRANSIT") return
    expect(transit.detail).toMatchObject({
      routeState: "EMPTY",
      plannedDistanceKm: 7.8,
      plannedDurationMinutes: 24,
    })
    expect(buildTransitPlanRequest(transit, graph.events)).toMatchObject({
      mode: "DRIVE",
      alternatives: 3,
    })
  })

  it("supports CITY to DAY to Event navigation with one and two-day cities", () => {
    const graph = createSilkRoadJourney({ id: "journey", ownerId: "owner" })
    const lanzhou = getJourneyScopeProjection(
      graph,
      "section",
      "section-lanzhou"
    )
    expect(lanzhou.events.map((event) => event.title)).toEqual([
      "第 3 天 · 兰州",
    ])
    const lanzhouDay = getJourneyScopeProjection(
      graph,
      "section",
      "day-lanzhou-2026-10-03"
    )
    expect(new Set(lanzhouDay.events.map((event) => event.type))).toEqual(
      new Set(["VISIT", "TRANSIT", "MEAL", "ACTIVITY", "STAY"])
    )

    const dunhuang = getJourneyScopeProjection(
      graph,
      "section",
      "section-dunhuang"
    )
    expect(dunhuang.events.map((event) => event.title)).toEqual([
      "第 6 天 · 莫高窟",
      "第 7 天 · 鸣沙山",
    ])
  })
})
