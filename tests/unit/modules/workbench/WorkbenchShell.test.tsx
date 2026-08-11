import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { createSilkRoadJourney } from "@/lib/mock-journeys"
import type { TargetWorkspaceSummary } from "@/modules/data-model/contracts"
import WorkbenchShell from "@/modules/workbench/ui/WorkbenchShell"
import type { WorkspaceSwitcherController } from "@/modules/workbench/ui/WorkspaceSwitcherPanel"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { workspaceDocumentForStory } from "@/tests/storybook/workspace-story"

const workspaceHistory: TargetWorkspaceSummary[] = [
  {
    id: "workspace-1",
    sourceJourneyId: "journey",
    title: "丝绸之路",
    preview: "继续调整河西走廊",
    updatedAt: "2026-08-12T08:00:00.000Z",
  },
  {
    id: "workspace-2",
    sourceJourneyId: null,
    title: "江南园林",
    preview: "尚未开始对话",
    updatedAt: "2026-08-11T08:00:00.000Z",
  },
]

function workspaceSwitcher(
  overrides: Partial<WorkspaceSwitcherController> = {}
): WorkspaceSwitcherController {
  return {
    workspaces: workspaceHistory,
    currentWorkspaceId: "workspace-1",
    currentTitle: "丝绸之路",
    listStatus: "ready",
    listError: null,
    pendingAction: null,
    actionError: null,
    onOpen: vi.fn(),
    onRetry: vi.fn(),
    onClearActionError: vi.fn(),
    onCreate: vi.fn(),
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
}

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

describe("workspace manager interaction flow", () => {
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
      useWorkspaceStore.setState({ composerInput: "保留的草稿" })
    })
  })

  it("awaits rename and delete actions while preserving chat state", async () => {
    const onRename = vi.fn().mockResolvedValue(undefined)
    const onDelete = vi.fn().mockResolvedValue(undefined)
    render(
      <WorkbenchShell
        workspaceSwitcher={workspaceSwitcher({ onRename, onDelete })}
      />
    )

    const chatScroll = document.querySelector<HTMLElement>(
      ".periplus-chat-scroll"
    )
    expect(chatScroll).not.toBeNull()
    chatScroll!.scrollTop = 42

    fireEvent.click(
      screen.getByRole("button", { name: /AI 旅行助手\s*丝绸之路/ })
    )
    fireEvent.click(screen.getByRole("button", { name: "丝绸之路的更多操作" }))
    fireEvent.click(screen.getByRole("button", { name: "重命名" }))
    fireEvent.change(screen.getByRole("textbox", { name: "重命名工作区" }), {
      target: { value: "河西走廊文化行程" },
    })
    fireEvent.click(screen.getByRole("button", { name: "保存名称" }))

    await waitFor(() =>
      expect(onRename).toHaveBeenCalledWith("workspace-1", "河西走廊文化行程")
    )

    fireEvent.click(screen.getByRole("button", { name: "丝绸之路的更多操作" }))
    fireEvent.click(screen.getByRole("button", { name: "删除" }))
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }))

    await waitFor(() => expect(onDelete).toHaveBeenCalledWith("workspace-1"))

    fireEvent.click(
      screen.getByRole("button", { name: /AI 旅行助手\s*丝绸之路/ })
    )
    expect(screen.getByRole("textbox", { name: "AI 输入" })).toHaveValue(
      "保留的草稿"
    )
    expect(chatScroll).toHaveProperty("scrollTop", 42)
  })

  it("locks every workspace action while the Agent is running", () => {
    act(() => {
      useWorkspaceStore
        .getState()
        .applyWorkspaceDocument(
          workspaceDocumentForStory(
            createSilkRoadJourney({ id: "journey", ownerId: "owner" }),
            { locked: true }
          )
        )
    })
    render(<WorkbenchShell workspaceSwitcher={workspaceSwitcher()} />)

    fireEvent.click(
      screen.getByRole("button", { name: /AI 旅行助手\s*丝绸之路/ })
    )

    expect(screen.getByRole("button", { name: "创建新工作区" })).toBeDisabled()
    expect(
      screen.getByRole("button", { name: /丝绸之路.*当前/ })
    ).toBeDisabled()
    expect(
      screen.getByRole("button", { name: "丝绸之路的更多操作" })
    ).toBeDisabled()
    expect(screen.getByRole("button", { name: /^江南园林尚未/ })).toBeDisabled()
  })

  it("preserves the expanded mobile sheet, scroll and composer draft", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    })
    act(() => {
      useWorkspaceStore.setState({
        workbenchTab: "chat",
        mobileSheetSnap: "expanded",
        composerInput: "移动端草稿",
      })
    })
    render(<WorkbenchShell workspaceSwitcher={workspaceSwitcher()} />)

    const shell = screen.getByRole("region", { name: "旅行规划工作台" })
    const chatScroll = document.querySelector<HTMLElement>(
      ".periplus-chat-scroll"
    )
    expect(chatScroll).not.toBeNull()
    chatScroll!.scrollTop = 120

    fireEvent.click(
      screen.getByRole("button", { name: /AI 旅行助手\s*丝绸之路/ })
    )
    expect(shell).toHaveStyle({ height: "calc(100svh - 8px)" })

    fireEvent.click(
      screen.getByRole("button", { name: /AI 旅行助手\s*丝绸之路/ })
    )
    expect(shell).toHaveStyle({ height: "calc(100svh - 8px)" })
    expect(screen.getByRole("textbox", { name: "AI 输入" })).toHaveValue(
      "移动端草稿"
    )
    expect(chatScroll).toHaveProperty("scrollTop", 120)
  })
})
