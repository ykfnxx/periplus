import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { createSilkRoadJourney } from "@/lib/mock-journeys"
import RoutePreview from "@/modules/workbench/ui/RoutePreview"
import RouteTimeline from "@/modules/workbench/ui/RouteTimeline"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { workspaceDocumentForStory } from "@/tests/storybook/workspace-story"
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

  it("derives the overview duration across CITY event chains", () => {
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(workspaceDocument())
    })

    render(<RoutePreview />)

    expect(screen.getByRole("heading", { name: "丝绸之路" })).toHaveTextContent(
      "丝绸之路 · 10 天"
    )
    expect(screen.getByText(/0\/9.*含城市内/)).toBeVisible()

    fireEvent.click(screen.getByRole("tab", { name: "兰州" }))
    expect(screen.getByText(/4 项安排/)).toBeVisible()
    expect(screen.getByText(/0\/1 段真实路线/)).toBeVisible()
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

  it("shows the visit gallery when the event has a provider cover", () => {
    const document = workspaceDocument()
    const visit = getJourneyScopeProjection(
      document.session.headGraph,
      "section",
      "section-xian"
    ).items.find((item) => item.event.type === "VISIT")
    if (!visit || visit.event.type !== "VISIT") {
      throw new Error("visit fixture is missing")
    }
    const eventWithCover = {
      ...visit.event,
      detail: {
        ...visit.event.detail,
        providerCoverImage: {
          provider: "amap" as const,
          url: "https://images.example/visit.jpg",
          fetchedAt: "2026-08-08T00:00:00.000Z",
        },
      },
    }
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(document)
    })

    render(<RouteTimeline items={[{ ...visit, event: eventWithCover }]} />)

    const card = screen.getByRole("button", {
      name: `选择事件 ${eventWithCover.title}`,
    })
    const board = card.parentElement?.querySelector("[data-photo-board]")
    expect(board).not.toBeNull()
    const photoItems = board?.querySelectorAll("[data-photo-item]") ?? []
    expect(photoItems).toHaveLength(1)
    expect(board).toHaveAttribute("data-active-index", "0")
    expect(screen.getByAltText(eventWithCover.title)).toHaveAttribute(
      "src",
      "https://images.example/visit.jpg"
    )
    expect(
      screen.queryByRole("button", { name: /上一张图片|下一张图片/ })
    ).not.toBeInTheDocument()
  })

  it("does not reserve gallery space when visit and stay image sources are absent", () => {
    const document = workspaceDocument()
    const items = getJourneyScopeProjection(
      document.session.headGraph,
      "section",
      "section-xian"
    ).items.filter(
      (item) => item.event.type === "VISIT" || item.event.type === "STAY"
    )
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(document)
    })

    render(<RouteTimeline items={items} />)

    expect(
      globalThis.document.querySelector("[data-photo-board]")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("provider-image-fallback-SIGHT")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId("provider-image-fallback-HOTEL")
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /上一张图片|下一张图片/ })
    ).not.toBeInTheDocument()
  })
})
