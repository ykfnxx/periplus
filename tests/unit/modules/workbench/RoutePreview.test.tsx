import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { createSilkRoadJourney } from "@/lib/mock-journeys"
import RoutePreview from "@/modules/workbench/ui/RoutePreview"
import RouteTimeline from "@/modules/workbench/ui/RouteTimeline"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { workspaceDocumentForStory } from "@/tests/storybook/workspace-story"
import { TARGET_CONTRACT_FIXTURES } from "@/modules/data-model/contracts/fixtures"
import { getJourneyScopeProjection } from "@/lib/journeys/projections"
import { plannedLocationOf } from "@/lib/journeys/locations"

function workspaceDocument() {
  return workspaceDocumentForStory(
    createSilkRoadJourney({ id: "journey", ownerId: "owner" })
  )
}

describe("target Workspace route preview", () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  })

  it("derives the overview duration across nested CITY and DAY scopes", () => {
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(workspaceDocument())
    })

    render(<RoutePreview />)

    expect(screen.getByRole("heading", { name: "丝绸之路" })).toHaveTextContent(
      "丝绸之路 · 10 天"
    )
    expect(screen.getByText(/0\/9.*含城市内/)).toBeVisible()
  })

  it("labels location cards by domain type without numeric circles", () => {
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(workspaceDocument())
      useWorkspaceStore.getState().enterSectionView("section-xian")
    })

    render(<RoutePreview />)

    for (const title of ["西安城墙", "大雁塔", "回民街"]) {
      const card = screen.getByRole("button", { name: `选择事件 ${title}` })
      expect(within(card).getByText("景点")).toBeVisible()
      expect(card).not.toHaveTextContent(/^\d+$/)
    }
  })

  it("uses authoritative location ordinals for overview marker palettes", () => {
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(workspaceDocument())
    })

    render(<RoutePreview />)

    const lanzhouCard = screen.getByRole("button", {
      name: "查看城市 兰州",
    })
    expect(within(lanzhouCard).getByText("城市")).toBeVisible()
    expect(lanzhouCard.querySelector(".bg-marker-mint")).not.toBeNull()
    expect(lanzhouCard.querySelector(".bg-marker-yellow")).toBeNull()
  })

  it("does not leak server ordinals into cards or Transit endpoint labels", () => {
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
      screen.getByRole("button", { name: "选择事件 西安城墙" })
    ).not.toHaveTextContent("7")
    expect(
      screen.getByRole("button", { name: "选择事件 大雁塔" })
    ).not.toHaveTextContent("8")
    const transit = screen.getByRole("button", { name: "交通事件 出租车" })
    expect(transit).toHaveTextContent(/西安城墙.*大雁塔/)
    expect(transit).not.toHaveTextContent("7 → 8")
  })

  it("renders distinct layouts for visit, meal, activity, and stay events", () => {
    const document = workspaceDocument()
    const sourceItems = getJourneyScopeProjection(
      document.session.headGraph,
      "section",
      "section-xian"
    ).items.filter(
      (item) =>
        item.event.type === "VISIT" ||
        item.event.type === "MEAL" ||
        item.event.type === "ACTIVITY" ||
        item.event.type === "STAY"
    )
    const [visit, mealSource, activitySource] = sourceItems
    if (!visit || !mealSource || !activitySource) {
      throw new Error("location fixtures are missing")
    }
    if (
      visit.event.type !== "VISIT" ||
      mealSource.event.type !== "VISIT" ||
      activitySource.event.type !== "VISIT"
    ) {
      throw new Error("unexpected fixture event type")
    }
    const meal = {
      ...mealSource,
      event: {
        ...mealSource.event,
        id: "meal-layout",
        title: "午餐",
        type: "MEAL" as const,
        detail: { ...mealSource.event.detail, cuisine: "陕西菜" },
      },
    }
    const activity = {
      ...activitySource,
      event: {
        ...activitySource.event,
        id: "activity-layout",
        title: "城墙骑行",
        type: "ACTIVITY" as const,
        detail: {
          ...activitySource.event.detail,
          bookingReference: "BOOK-01",
        },
      },
    }
    const stay = {
      ...visit,
      event: {
        ...visit.event,
        id: "stay-layout",
        title: "西安酒店",
        type: "STAY" as const,
        detail: { ...visit.event.detail, checkInNote: "前台办理入住" },
      },
    }
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(document)
    })

    render(<RouteTimeline items={[visit, meal, activity, stay]} />)

    expect(screen.getByText("景点")).toBeVisible()
    expect(screen.getByText("陕西菜")).toBeVisible()
    expect(screen.getByText("活动")).toBeVisible()
    expect(screen.getByText("预约凭证 · BOOK-01")).toBeVisible()
    expect(screen.getByText("住宿")).toBeVisible()
    expect(screen.getByText("入住")).toBeVisible()
    expect(screen.getByText("离店")).toBeVisible()
  })

  it("keeps visit photos inside independently rounded media boards", () => {
    const document = workspaceDocument()
    const visit = getJourneyScopeProjection(
      document.session.headGraph,
      "section",
      "section-xian"
    ).items.find((item) => item.event.type === "VISIT")
    if (!visit || visit.event.type !== "VISIT") {
      throw new Error("visit fixture is missing")
    }
    const location = plannedLocationOf(visit.event)
    if (!location) throw new Error("visit fixture location is missing")
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(document)
      useWorkspaceStore.getState().setPhotoShares(
        Array.from({ length: 4 }, (_, index) => ({
          id: `photo-${index}`,
          ownerId: "owner",
          ownerName: "Owner",
          lat: location.lat,
          lng: location.lng,
          imageDataUrl:
            "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
          caption: `photo ${index}`,
          createdAt: index,
          canDelete: true,
        }))
      )
    })

    render(<RouteTimeline items={[visit]} />)

    const card = screen.getByRole("button", {
      name: `选择事件 ${visit.event.title}`,
    })
    const board = card.querySelector("[data-photo-board]")
    expect(board).not.toBeNull()
    const photoItems = board?.querySelectorAll("[data-photo-item]") ?? []
    expect(photoItems).toHaveLength(3)
    for (const item of photoItems) expect(item).toHaveClass("rounded-lg")
    expect(within(card).getByText("+1")).toBeVisible()
  })

  it("renders transit choices as an icon-free clipped horizontal scroller", () => {
    const fixture = TARGET_CONTRACT_FIXTURES.find(
      (candidate) => candidate.id === "03-transit-plan-choice"
    )
    const graph = fixture?.cases[0]?.input.graph
    if (!graph) throw new Error("transit choice fixture is missing")
    act(() => {
      useWorkspaceStore
        .getState()
        .applyWorkspaceDocument(workspaceDocumentForStory(graph))
    })
    const items = getJourneyScopeProjection(graph, "overview", null).items
    render(<RouteTimeline items={items} />)

    fireEvent.click(screen.getByRole("button", { name: "交通事件 驾车" }))

    const choices = screen
      .getByText("选择路线方案")
      .parentElement?.querySelector(".overflow-x-auto")
    expect(choices).not.toBeNull()
    expect(choices).toHaveClass("scrollbar-hidden", "flex", "px-4")
    for (const label of ["推荐", "最快", "低价"]) {
      const button = screen.getByText(label).closest("button")
      expect(button).toHaveClass("h-10", "w-[122px]")
      expect(button?.querySelector("svg")).toBeNull()
    }
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
    expect(screen.getByRole("tab", { name: "杭州" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
    expect(screen.getByRole("tab", { name: "第一天" })).toHaveAttribute(
      "aria-selected",
      "false"
    )

    fireEvent.click(screen.getByRole("button", { name: "进入分组 第一天" }))
    expect(useWorkspaceStore.getState().activeSectionEventId).toBe("day")
    expect(screen.getByRole("tab", { name: "第一天" })).toHaveAttribute(
      "aria-selected",
      "true"
    )
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
