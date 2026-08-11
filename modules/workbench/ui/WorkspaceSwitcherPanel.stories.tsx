import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { ArrowUp, Compass, Sparkles } from "lucide-react"
import type { TargetWorkspaceHistoryEntry } from "@/modules/data-model/contracts"
import WorkspaceSwitcherPanel from "./WorkspaceSwitcherPanel"

const STORY_NOW = Date.parse("2026-08-12T10:00:00+08:00")

const initialWorkspaces: TargetWorkspaceHistoryEntry[] = [
  {
    id: "workspace-shanxi",
    sourceJourneyId: "journey-shanxi",
    title: "山西古建巡礼",
    preview: "把应县木塔调整到第三天，并补充附近的住宿选择",
    updatedAt: "2026-08-12T09:48:00+08:00",
  },
  {
    id: "workspace-silk-road",
    sourceJourneyId: "journey-silk-road",
    title: "河西走廊自驾",
    preview: "已把张掖丹霞改到日落前抵达，下一步确认敦煌段",
    updatedAt: "2026-08-12T07:35:00+08:00",
  },
  {
    id: "workspace-jiangnan",
    sourceJourneyId: null,
    title: "江南园林与书店",
    preview: "苏州三天，不赶景点，想留半天逛旧书店",
    updatedAt: "2026-08-10T16:20:00+08:00",
  },
  {
    id: "workspace-fujian",
    sourceJourneyId: "journey-fujian",
    title: "闽南沿海周末",
    preview: "尚未开始对话",
    updatedAt: "2026-08-03T12:00:00+08:00",
  },
]

interface WorkspaceStorySurfaceProps {
  defaultOpen?: boolean
  locked?: boolean
  mobile?: boolean
}

function WorkspaceStorySurface({
  defaultOpen = false,
  locked = false,
  mobile = false,
}: WorkspaceStorySurfaceProps) {
  const [workspaces, setWorkspaces] = useState(initialWorkspaces)
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(
    initialWorkspaces[0].id
  )
  const currentWorkspace = workspaces.find(
    (workspace) => workspace.id === currentWorkspaceId
  )

  const createWorkspace = () => {
    const workspace: TargetWorkspaceHistoryEntry = {
      id: "workspace-new",
      sourceJourneyId: null,
      title: "新的旅行计划",
      preview: "",
      updatedAt: new Date(STORY_NOW).toISOString(),
    }
    setWorkspaces((current) => [
      workspace,
      ...current.filter((item) => item.id !== workspace.id),
    ])
    setCurrentWorkspaceId(workspace.id)
  }

  const deleteWorkspace = (workspaceId: string) => {
    const remainingWorkspaces = workspaces.filter(
      (workspace) => workspace.id !== workspaceId
    )
    setWorkspaces(remainingWorkspaces)
    if (workspaceId === currentWorkspaceId) {
      setCurrentWorkspaceId(remainingWorkspaces[0]?.id ?? "")
    }
  }

  return (
    <main className={`min-h-screen bg-cream ${mobile ? "p-2" : "p-5"}`}>
      <WorkspaceSwitcherPanel
        className={`flex ${
          mobile
            ? "h-[calc(100svh-16px)] w-full rounded-[22px]"
            : "h-[min(820px,calc(100vh-40px))] w-[340px]"
        }`}
        workspaces={workspaces}
        currentWorkspaceId={currentWorkspaceId}
        defaultOpen={defaultOpen}
        locked={locked}
        now={STORY_NOW}
        onBack={mobile ? () => undefined : undefined}
        onCollapse={mobile ? undefined : () => undefined}
        onCreate={createWorkspace}
        onSelect={setCurrentWorkspaceId}
        onRename={(workspaceId, title) =>
          setWorkspaces((current) =>
            current.map((workspace) =>
              workspace.id === workspaceId ? { ...workspace, title } : workspace
            )
          )
        }
        onDelete={deleteWorkspace}
      >
        <MockConversation
          title={currentWorkspace?.title ?? "新的旅行计划"}
          isBlank={!currentWorkspace?.preview}
        />
      </WorkspaceSwitcherPanel>
    </main>
  )
}

function MockConversation({
  title,
  isBlank,
}: {
  title: string
  isBlank: boolean
}) {
  if (isBlank) {
    return (
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5">
        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-selected-soft text-russet">
            <Compass className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-[15px] font-black text-ink">从哪里出发？</h2>
          <p className="mt-2 max-w-[240px] text-[11px] leading-5 text-walnut">
            说说时间、兴趣或想去的地方，我会和你一起把它整理成旅程。
          </p>
        </div>
        <MockComposer />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-5 pt-4">
        <p className="text-[10px] font-black tracking-[0.1em] text-teak">
          当前上下文
        </p>
        <div className="mt-2 rounded-[10px] bg-cream px-3.5 py-3">
          <div className="flex items-center gap-2.5">
            <span className="h-4 w-4 shrink-0 rounded-full bg-russet" />
            <p className="truncate text-[12px] font-black text-ink">
              {title} · 全程总览
            </p>
          </div>
          <p className="mt-1 pl-[26px] text-[10px] font-bold text-teak">
            8 个地点 · 6 天 · 684 公里
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <div className="ml-auto max-w-[86%] rounded-[14px] rounded-br-[4px] bg-ink px-3.5 py-3 text-[11px] leading-5 text-soft-white">
          继续完善“{title}”，优先保证每天的节奏宽松。
        </div>
        <div className="max-w-[90%] rounded-[14px] rounded-bl-[4px] bg-cream px-3.5 py-3 text-[11px] leading-5 text-ink">
          <p className="font-bold">好的，我会沿用这个工作区的上下文。</p>
          <p className="mt-1 text-walnut">
            接下来可以继续调整停留时间、交通顺序或住宿偏好，其他工作区不会受到影响。
          </p>
        </div>
      </div>

      <div className="shrink-0 px-5 pb-4">
        <MockComposer />
      </div>
    </div>
  )
}

function MockComposer() {
  return (
    <div className="rounded-xl border border-ink-10 bg-white/75 p-2 shadow-periplus-soft">
      <textarea
        rows={3}
        aria-label="AI 输入"
        placeholder="继续描述你的旅行想法…"
        className="w-full resize-none bg-transparent px-2 py-1 text-[11px] leading-5 text-ink outline-none placeholder:text-walnut/70"
      />
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="flex items-center gap-1 text-[9px] font-bold text-teak">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          自动规划
        </span>
        <button
          type="button"
          aria-label="发送"
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-russet text-soft-white"
        >
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

const meta = {
  title: "Workbench/WorkspaceSwitcher",
  component: WorkspaceStorySurface,
  parameters: {
    layout: "fullscreen",
    a11y: { test: "off" },
    viewport: {
      options: {
        mobileWorkspace: {
          name: "Mobile workspace",
          styles: { width: "390px", height: "844px" },
          type: "mobile",
        },
      },
    },
  },
} satisfies Meta<typeof WorkspaceStorySurface>

export default meta
type Story = StoryObj<typeof meta>

export const WorkspaceList: Story = {
  args: { defaultOpen: true },
}

export const Conversation: Story = {
  args: { defaultOpen: false },
}

export const AgentRunning: Story = {
  args: { defaultOpen: true, locked: true },
}

export const MobileWorkspaceList: Story = {
  args: { defaultOpen: true, mobile: true },
  globals: {
    viewport: { value: "mobileWorkspace", isRotated: false },
  },
}
