import { act, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import RoutePolyline from "@/modules/map-renderer/ui/RoutePolyline"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { workspaceDocumentForStory } from "@/tests/storybook/workspace-story"
import { planningJourney } from "@/tests/storybook/journey-fixtures"
const configs: { path: [number, number][] }[] = []
class Polyline {
  constructor(config: { path: [number, number][] }) {
    configs.push(config)
  }
  on() {}
}
beforeEach(() => {
  configs.length = 0
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  vi.stubGlobal("AMap", { Polyline })
})
afterEach(() => vi.unstubAllGlobals())
it("updates the selected route geometry only from the authoritative Journey revision", () => {
  const map = { add: vi.fn(), remove: vi.fn() }
  const before = workspaceDocumentForStory(structuredClone(planningJourney))
  useWorkspaceStore.getState().setMap(map as unknown as AMap.Map)
  useWorkspaceStore.getState().applyWorkspaceDocument(before)
  render(<RoutePolyline />)
  expect(configs[0].path[0]).toEqual([120.149, 30.243])
  const after = structuredClone(before)
  after.session.headWorkspaceRevision = 2
  after.session.journey.revision = 2
  after.session.journey.events[1].transit!.route!.plans[0].segments[0].positions =
    [
      [118.8, 31.2],
      [119.2, 31.6],
    ]
  act(() => {
    useWorkspaceStore.getState().applyWorkspaceDocument(after)
  })
  expect(map.remove).toHaveBeenCalled()
  expect(configs.at(-1)!.path[0]).toEqual([118.8, 31.2])
})
it("does not invent a connector when the event has no current route", () => {
  const journey = structuredClone(planningJourney)
  journey.events[1].transit = {
    ...journey.events[1].transit!,
    routeState: "EMPTY",
    route: undefined,
  }
  useWorkspaceStore
    .getState()
    .setMap({ add: vi.fn(), remove: vi.fn() } as unknown as AMap.Map)
  useWorkspaceStore
    .getState()
    .applyWorkspaceDocument(workspaceDocumentForStory(journey))
  render(<RoutePolyline />)
  expect(configs).toHaveLength(0)
})
