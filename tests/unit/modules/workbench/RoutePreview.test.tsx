import { act, render, screen, within } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { createSilkRoadJourney } from "@/lib/mock-journeys"
import RoutePreview from "@/modules/workbench/ui/RoutePreview"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { workspaceDocumentForStory } from "@/tests/storybook/workspace-story"

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
