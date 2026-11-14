import { renderHook } from "@testing-library/react"
import type { Map } from "maplibre-gl"
import { expect, it, vi } from "vitest"
import useJourneyRoutes from "@/modules/travelogue/ui/map/useJourneyRoutes"
import { transitJourneyFixture } from "@/tests/fixtures/journey"
import { coordinateToWgs84 } from "@/lib/journeys/coordinates"

function mapFixture() {
  return {
    addSource: vi.fn(),
    addLayer: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    getLayer: vi.fn(() => true),
    getSource: vi.fn(() => true),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
  }
}

it("converts recorded geometry without mutating it and replaces layers when the journey changes", () => {
  const map = mapFixture()
  const before = transitJourneyFixture()
  const segment = before.events[1].transit!.route!.plans[0].segments[0]
  segment.geometryKind = "SCHEMATIC"
  segment.positions = [
    [120.149, 30.243],
    [121.47, 31.23],
  ]
  const select = vi.fn()
  const { rerender, unmount } = renderHook(
    ({ events }) =>
      useJourneyRoutes(map as unknown as Map, events, null, select),
    { initialProps: { events: before.events } }
  )
  expect(map.addSource.mock.calls[0][1].data.geometry.coordinates[0]).toEqual(
    coordinateToWgs84(120.149, 30.243, "GCJ02")
  )
  expect(segment.positions[0]).toEqual([120.149, 30.243])
  expect(map.addLayer.mock.calls[0][0].paint["line-dasharray"]).toBeDefined()
  map.on.mock.calls[0][2]()
  expect(select).toHaveBeenCalledWith(before.events[1].id)
  const after = structuredClone(before)
  after.events[1].transit!.route!.plans[0].segments[0].positions = [
    [118.8, 31.2],
    [119.2, 31.6],
  ]
  rerender({ events: after.events })
  expect(map.removeSource).toHaveBeenCalled()
  expect(
    map.addSource.mock.calls.at(-1)![1].data.geometry.coordinates[0]
  ).toEqual(coordinateToWgs84(118.8, 31.2, "GCJ02"))
  unmount()
  expect(map.off.mock.calls.length).toBe(map.on.mock.calls.length)
})

it("does not invent a connector when an event has no current route", () => {
  const journey = transitJourneyFixture()
  journey.events[1].transit = {
    ...journey.events[1].transit!,
    routeState: "EMPTY",
    route: undefined,
  }
  const map = mapFixture()
  renderHook(() =>
    useJourneyRoutes(map as unknown as Map, journey.events, null)
  )
  expect(map.addSource).not.toHaveBeenCalled()
})
