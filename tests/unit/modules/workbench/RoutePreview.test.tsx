import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { createSilkRoadJourney } from "@/lib/mock-journeys"
import RoutePreview from "@/modules/workbench/ui/RoutePreview"
import RouteTimeline from "@/modules/workbench/ui/RouteTimeline"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { workspaceDocumentForStory } from "@/tests/storybook/workspace-story"
import { TARGET_CONTRACT_FIXTURES } from "@/modules/data-model/contracts/fixtures"
import { getJourneyScopeProjection } from "@/lib/journeys/projections"

function workspaceDocument() {
  return workspaceDocumentForStory(
    createSilkRoadJourney({ id: "journey", ownerId: "owner" })
  )
}

describe("target Workspace route preview", () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  })

  it("numbers location cards independently from Transit events", () => {
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(workspaceDocument())
      useWorkspaceStore.getState().enterSectionView("section-xian")
    })

    render(<RoutePreview />)

    expect(
      within(
        screen.getByRole("button", { name: "选择事件 西安城墙" })
      ).getByText("1")
    ).toBeVisible()
    expect(
      within(screen.getByRole("button", { name: "选择事件 大雁塔" })).getByText(
        "2"
      )
    ).toBeVisible()
    expect(
      within(screen.getByRole("button", { name: "选择事件 回民街" })).getByText(
        "3"
      )
    ).toBeVisible()
  })

  it("renders the server-resolved location ordinals without recomputing", () => {
    const document = workspaceDocument()
    const items = getJourneyScopeProjection(
      document.session.headGraph,
      "section",
      "section-xian"
    ).items.map((item) => ({
      ...item,
      resolved: {
        ...item.resolved,
        ...(item.resolved.locationOrdinal
          ? { locationOrdinal: item.resolved.locationOrdinal + 6 }
          : {}),
        ...(item.resolved.fromLocationOrdinal
          ? { fromLocationOrdinal: item.resolved.fromLocationOrdinal + 6 }
          : {}),
        ...(item.resolved.toLocationOrdinal
          ? { toLocationOrdinal: item.resolved.toLocationOrdinal + 6 }
          : {}),
      },
    }))
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(document)
    })

    render(<RouteTimeline items={items} />)

    expect(
      within(
        screen.getByRole("button", { name: "选择事件 西安城墙" })
      ).getByText("7")
    ).toBeVisible()
    expect(
      within(screen.getByRole("button", { name: "选择事件 大雁塔" })).getByText(
        "8"
      )
    ).toBeVisible()
    expect(
      screen.getByRole("button", { name: "交通事件 出租车" })
    ).toHaveTextContent("7 → 8")
  })

  it("drills from CITY to DAY to events and returns to the parent scope", () => {
    const fixture = TARGET_CONTRACT_FIXTURES.find(
      (candidate) => candidate.id === "02-city-day-event-drilldown"
    )
    const graph = fixture?.cases[0]?.input.graph
    if (!graph) throw new Error("nested scope fixture is missing")
    act(() => {
      useWorkspaceStore
        .getState()
        .applyWorkspaceDocument(workspaceDocumentForStory(graph))
    })
    render(<RoutePreview />)

    fireEvent.click(screen.getByRole("button", { name: "查看城市 杭州" }))
    expect(useWorkspaceStore.getState().activeSectionEventId).toBe("city")

    fireEvent.click(screen.getByRole("button", { name: "进入分组 第一天" }))
    expect(useWorkspaceStore.getState().activeSectionEventId).toBe("day")
    expect(screen.getByRole("button", { name: "选择事件 西湖" })).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: "返回上一级" }))
    expect(useWorkspaceStore.getState().activeSectionEventId).toBe("city")
    expect(
      screen.getByRole("button", { name: "进入分组 第一天" })
    ).toBeVisible()
  })

  it("shows the authoritative Workspace draft state", () => {
    const document = workspaceDocument()
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(document)
    })
    const { rerender } = render(<RoutePreview />)

    expect(screen.getByText("未保存")).toBeVisible()

    document.draftState = "CLEAN"
    act(() => {
      useWorkspaceStore
        .getState()
        .applyWorkspaceDocument(structuredClone(document))
    })
    rerender(<RoutePreview />)
    expect(screen.getByText("已保存")).toBeVisible()
  })
})
