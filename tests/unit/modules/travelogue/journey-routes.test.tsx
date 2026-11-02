import { renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import useJourneyRoutes from "@/modules/travelogue/ui/useJourneyRoutes"
import { transitJourneyFixture } from "@/tests/fixtures/journey"

const configs: { path: [number, number][]; strokeStyle: string }[] = []
class Polyline {
  constructor(config: (typeof configs)[number]) {
    configs.push(config)
  }
  on() {}
}
beforeEach(() => {
  configs.length = 0
  vi.stubGlobal("AMap", { Polyline })
})
afterEach(() => vi.unstubAllGlobals())

it("updates recorded route geometry when the journey changes and marks schematic paths", () => {
  const map = { add: vi.fn(), remove: vi.fn() } as unknown as AMap.Map
  const before = transitJourneyFixture()
  const segment = before.events[1].transit!.route!.plans[0].segments[0]
  segment.geometryKind = "SCHEMATIC"
  segment.positions = [
    [120.149, 30.243],
    [121.47, 31.23],
  ]
  const { rerender } = renderHook(
    ({ events }) => useJourneyRoutes(map, events, null),
    { initialProps: { events: before.events } }
  )
  expect(configs[0].path[0]).toEqual([120.149, 30.243])
  expect(configs[0].strokeStyle).toBe("dashed")
  const after = structuredClone(before)
  after.revision += 1
  after.events[1].transit!.route!.plans[0].segments[0].positions = [
    [118.8, 31.2],
    [119.2, 31.6],
  ]
  rerender({ events: after.events })
  expect(map.remove).toHaveBeenCalled()
  expect(configs.at(-1)!.path[0]).toEqual([118.8, 31.2])
})

it("does not invent a connector when an event has no current route", () => {
  const journey = transitJourneyFixture()
  journey.events[1].transit = {
    ...journey.events[1].transit!,
    routeState: "EMPTY",
    route: undefined,
  }
  const map = { add: vi.fn(), remove: vi.fn() } as unknown as AMap.Map
  renderHook(() => useJourneyRoutes(map, journey.events, null))
  expect(configs).toHaveLength(0)
})
