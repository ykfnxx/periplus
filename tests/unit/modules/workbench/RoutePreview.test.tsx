import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import RoutePreview from "@/modules/workbench/ui/RoutePreview"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import {
  selectWorkspaceJourney,
  selectSelectedWorkspaceEvent,
} from "@/modules/workspace/state/selectors"
import { workspaceDocumentForStory } from "@/tests/storybook/workspace-story"
import {
  planningJourney,
  singleChainJourney,
} from "@/tests/storybook/journey-fixtures"
import { dispatchMapIntent } from "@/modules/workspace/ui/WorkspaceController"

beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }))
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  HTMLElement.prototype.scrollIntoView = vi.fn()
  window.scrollTo = vi.fn()
})
afterEach(() => vi.unstubAllGlobals())

beforeEach(() => {
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  HTMLElement.prototype.scrollIntoView = vi.fn()
})

describe("one Journey event chain", () => {
  it("renders cross-city visits and an unlocated note in author order", () => {
    useWorkspaceStore
      .getState()
      .applyWorkspaceDocument(workspaceDocumentForStory(singleChainJourney))
    const { container } = render(<RoutePreview />)
    expect(
      Array.from(container.querySelectorAll("[data-record-id]")).map((node) =>
        node.getAttribute("data-record-id")
      )
    ).toEqual(singleChainJourney.events.map((event) => event.id))
    expect(screen.getByRole("heading", { name: "路上的随记" })).toBeVisible()
    expect(
      screen.queryByRole("button", { name: /进入城市/ })
    ).not.toBeInTheDocument()
  })

  it("date navigation scrolls without filtering, reordering or clearing selection", () => {
    useWorkspaceStore
      .getState()
      .applyWorkspaceDocument(workspaceDocumentForStory(singleChainJourney))
    useWorkspaceStore.getState().selectEvent("hangzhou-breakfast")
    const { container } = render(<RoutePreview />)
    const viewport = document.createElement("div")
    viewport.dataset.overlayScrollViewport = ""
    const scrollTo = vi.fn()
    viewport.scrollTo = scrollTo
    container.parentNode!.insertBefore(viewport, container)
    viewport.appendChild(container)
    fireEvent.click(screen.getByRole("tab", { name: "跳转到10月20日" }))
    expect(scrollTo).toHaveBeenCalled()
    expect(container.querySelectorAll("[data-record-id]")).toHaveLength(5)
    expect(useWorkspaceStore.getState().selectedEventId).toBe(
      "hangzhou-breakfast"
    )
  })

  it("map selection uses the original event identity across cities", () => {
    const doc = workspaceDocumentForStory(singleChainJourney)
    useWorkspaceStore.getState().applyWorkspaceDocument(doc)
    render(<RoutePreview />)
    act(() =>
      dispatchMapIntent({
        type: "map.event-selected",
        eventId: "hangzhou-return",
      })
    )
    expect(useWorkspaceStore.getState().selectedEventId).toBe("hangzhou-return")
    expect(screen.getByRole("article", { name: "回到杭州" })).toHaveAttribute(
      "aria-current",
      "true"
    )
    expect(selectWorkspaceJourney(useWorkspaceStore.getState())).toBe(
      doc.session.journey
    )
  })

  it("shows planning, hotel and receipt fields on the same event cards", async () => {
    useWorkspaceStore
      .getState()
      .applyWorkspaceDocument(workspaceDocumentForStory(planningJourney))
    render(<RoutePreview />)
    expect(screen.getByText("示例高铁路线")).toBeVisible()
    expect(screen.getByText(/480.00 CNY/)).toBeVisible()
    expect(screen.getByText("西湖茶馆")).toBeVisible()
    fireEvent.click(
      screen.getByRole("button", { name: "展开在上海住一晚的详情" })
    )
    await waitFor(() => expect(screen.getByText("15:00 后入住")).toBeVisible())
  })

  it("commit retains selection and refreshes it from the incoming snapshot", () => {
    const before = workspaceDocumentForStory(singleChainJourney)
    useWorkspaceStore.getState().applyWorkspaceDocument(before)
    useWorkspaceStore.getState().selectEvent("hangzhou-return")
    const after = structuredClone(before)
    after.session.headWorkspaceRevision = 2
    after.session.journey.revision = 2
    after.session.journey.events.find(
      (event) => event.id === "hangzhou-return"
    )!.body = "更新后的正文"
    useWorkspaceStore
      .getState()
      .applyJourneyCommit(after, "补充正文", ["hangzhou-return"])
    expect(
      selectSelectedWorkspaceEvent(useWorkspaceStore.getState())?.body
    ).toBe("更新后的正文")
    expect(selectWorkspaceJourney(useWorkspaceStore.getState())).toBe(
      after.session.journey
    )
  })

  it("removed selection falls to the nearest chain position; stale snapshots cannot undo it", () => {
    const before = workspaceDocumentForStory(singleChainJourney)
    useWorkspaceStore.getState().applyWorkspaceDocument(before)
    useWorkspaceStore.getState().selectEvent("train-to-shanghai")
    const after = structuredClone(before)
    after.session.headWorkspaceRevision = 2
    after.session.journey.revision = 2
    after.session.journey.events.splice(1, 1)
    useWorkspaceStore.getState().applyWorkspaceDocument(after)
    expect(useWorkspaceStore.getState().selectedEventId).toBe("shanghai-walk")
    expect(useWorkspaceStore.getState().applyWorkspaceDocument(before)).toBe(
      false
    )
    expect(useWorkspaceStore.getState().selectedEventId).toBe("shanghai-walk")
  })
})
