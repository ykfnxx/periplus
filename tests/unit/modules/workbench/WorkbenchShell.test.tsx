import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSilkRoadJourney } from "@/lib/mock-journeys"
import WorkbenchShell from "@/modules/workbench/ui/WorkbenchShell"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { workspaceDocumentForStory } from "@/tests/storybook/workspace-story"

describe("mobile workbench presentation flow", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    })
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
    act(() => {
      useWorkspaceStore
        .getState()
        .applyWorkspaceDocument(
          workspaceDocumentForStory(
            createSilkRoadJourney({ id: "journey", ownerId: "owner" })
          )
        )
    })
  })

  it("uses one drawer and contextual actions instead of persistent tabs", () => {
    render(<WorkbenchShell />)

    expect(
      screen.queryByRole("tablist", { name: "工作台面板" })
    ).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "打开 AI 助手" })).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: "打开 AI 助手" }))
    expect(useWorkspaceStore.getState().workbenchTab).toBe("chat")
    expect(useWorkspaceStore.getState().mobileSheetSnap).toBe("expanded")
    expect(screen.getByRole("button", { name: "返回行程" })).toBeVisible()

    fireEvent.click(screen.getByRole("button", { name: "返回行程" }))
    expect(useWorkspaceStore.getState().workbenchTab).toBe("preview")
    expect(useWorkspaceStore.getState().mobileSheetSnap).toBe("half")
    expect(screen.getByRole("button", { name: "打开 AI 助手" })).toBeVisible()
  })
})

describe("wide workbench presentation flow", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1440,
    })
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
    act(() => {
      useWorkspaceStore
        .getState()
        .applyWorkspaceDocument(
          workspaceDocumentForStory(
            createSilkRoadJourney({ id: "journey", ownerId: "owner" })
          )
        )
    })
  })

  it("removes the AI rail and adds a contextual composer when chat is collapsed", () => {
    render(<WorkbenchShell />)

    fireEvent.click(screen.getByRole("button", { name: "收起AI 旅行助手" }))

    expect(
      screen.queryByRole("button", { name: "展开AI 旅行助手" })
    ).not.toBeInTheDocument()
    expect(screen.getByText("继续修改行程")).toBeVisible()
    expect(screen.getByRole("textbox", { name: "AI 输入" })).toBeVisible()
  })

  it("reopens the AI panel after submitting from the contextual composer", () => {
    const sendAgentEvent = vi.fn()
    useWorkspaceStore.getState().setAgentSender(sendAgentEvent)
    render(<WorkbenchShell />)
    fireEvent.click(screen.getByRole("button", { name: "收起AI 旅行助手" }))

    fireEvent.change(screen.getByRole("textbox", { name: "AI 输入" }), {
      target: { value: "把午餐改晚一点" },
    })
    fireEvent.click(screen.getByRole("button", { name: "发送" }))

    expect(
      screen.getByRole("button", { name: "收起AI 旅行助手" })
    ).toBeVisible()
    expect(sendAgentEvent).toHaveBeenCalledWith("agent.run.start", {
      prompt: "把午餐改晚一点",
      mode: "auto",
    })
  })
})
