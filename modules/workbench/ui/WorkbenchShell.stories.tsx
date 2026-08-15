import { useState } from "react"
import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import MapSurface from "@/modules/map-renderer/ui/MapSurface"
import type {
  TargetJourneyGraphSnapshot,
  TargetWorkspaceSummary,
} from "@/modules/data-model/contracts"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { dispatchMapIntent } from "@/modules/workspace/ui/WorkspaceController"
import WorkspaceInteractionLayer from "@/modules/workspace/ui/WorkspaceInteractionLayer"
import { deriveFlatJourneyLayout } from "@/lib/journeys/flat-workspace-projection"
import {
  dunhuangRouteStoryJourney,
  silkRoadJourneyWithPlans,
} from "@/tests/storybook/route-fixtures"
import {
  withWorkspaceState,
  workspaceDocumentForStory,
} from "@/tests/storybook/workspace-story"
import WorkbenchShell from "./WorkbenchShell"
import type { WorkspaceSwitcherController } from "./WorkspaceSwitcherPanel"

const STORY_NOW = Date.parse("2026-08-12T10:00:00+08:00")

const workspaceHistory: TargetWorkspaceSummary[] = [
  {
    id: "storybook-workspace",
    sourceJourneyId: silkRoadJourneyWithPlans.id,
    title: silkRoadJourneyWithPlans.title,
    preview: "把敦煌多留一天，再确认兰州到张掖的交通顺序",
    updatedAt: "2026-08-12T09:48:00+08:00",
  },
  {
    id: "workspace-dunhuang",
    sourceJourneyId: dunhuangRouteStoryJourney.id,
    title: "敦煌壁画与河西古道",
    preview: "莫高窟上午参观，下午沿鸣沙山安排轻松一些",
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
    sourceJourneyId: null,
    title: "闽南沿海周末",
    preview: "尚未开始对话",
    updatedAt: "2026-08-03T12:00:00+08:00",
  },
]

function ProductionWorkbenchSurface({
  workspaceSwitcher,
}: {
  workspaceSwitcher?: WorkspaceSwitcherController
} = {}) {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-cream text-ink">
      <MapSurface onIntent={dispatchMapIntent} />
      <WorkspaceInteractionLayer workspaceSwitcher={workspaceSwitcher} />
    </div>
  )
}

function WorkspaceManagementSurface() {
  const [workspaces, setWorkspaces] = useState(workspaceHistory)
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState(
    workspaceHistory[0].id
  )
  const currentTitle =
    workspaces.find((workspace) => workspace.id === currentWorkspaceId)
      ?.title ?? "新工作区"

  const activateWorkspace = (workspace: TargetWorkspaceSummary) => {
    setCurrentWorkspaceId(workspace.id)
    const document = workspaceDocumentForStory(
      graphForWorkspaceStory(workspace)
    )
    document.session.id = workspace.id
    useWorkspaceStore.setState({ workspaceDocument: document })
  }

  const createWorkspace = () => {
    const workspace: TargetWorkspaceSummary = {
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
    activateWorkspace(workspace)
  }

  const selectWorkspace = (workspaceId: string) => {
    const workspace = workspaces.find((item) => item.id === workspaceId)
    if (workspace) activateWorkspace(workspace)
  }

  const deleteWorkspace = (workspaceId: string) => {
    const remainingWorkspaces = workspaces.filter(
      (workspace) => workspace.id !== workspaceId
    )
    setWorkspaces(remainingWorkspaces)
    if (workspaceId === currentWorkspaceId && remainingWorkspaces[0]) {
      activateWorkspace(remainingWorkspaces[0])
    }
  }

  return (
    <ProductionWorkbenchSurface
      workspaceSwitcher={{
        workspaces,
        currentWorkspaceId,
        currentTitle,
        listStatus: "ready",
        listError: null,
        pendingAction: null,
        actionError: null,
        defaultOpen: true,
        now: STORY_NOW,
        onOpen: () => undefined,
        onRetry: () => undefined,
        onClearActionError: () => undefined,
        onCreate: createWorkspace,
        onSelect: selectWorkspace,
        onRename: (workspaceId, title) =>
          setWorkspaces((current) =>
            current.map((workspace) =>
              workspace.id === workspaceId ? { ...workspace, title } : workspace
            )
          ),
        onDelete: deleteWorkspace,
      }}
    />
  )
}

function graphForWorkspaceStory(workspace: TargetWorkspaceSummary) {
  const baseGraph =
    workspace.id === "workspace-dunhuang"
      ? dunhuangRouteStoryJourney
      : silkRoadJourneyWithPlans
  const graph: TargetJourneyGraphSnapshot = {
    ...baseGraph,
    title: workspace.title,
  }

  if (workspace.id !== "workspace-new") return graph

  return {
    ...graph,
    events: [],
    links: [],
    replacements: [],
    branchSelections: [],
    transitPlanningRuns: [],
    eventAssetLinks: [],
    observations: [],
    eventSourceLinks: [],
  }
}

function cityWorkspaceState(
  graph: TargetJourneyGraphSnapshot,
  cityName: string
) {
  const workspaceDocument = workspaceDocumentForStory(graph)
  const segment = deriveFlatJourneyLayout(
    workspaceDocument.session.flatJourney
  ).segments.find((candidate) => candidate.city.name === cityName)
  return {
    workspaceDocument,
    viewLevel: "section" as const,
    activeSectionEventId: segment?.id ?? null,
  }
}

const meta = {
  title: "Workbench/WorkbenchShell",
  component: WorkbenchShell,
  parameters: {
    layout: "fullscreen",
    a11y: { test: "off" },
    viewport: {
      options: {
        productionWide: {
          name: "Production wide",
          styles: { width: "1440px", height: "900px" },
          type: "desktop",
        },
        workspaceMobile: {
          name: "Workspace mobile",
          styles: { width: "390px", height: "844px" },
          type: "mobile",
        },
      },
    },
  },
  render: () => <ProductionWorkbenchSurface />,
} satisfies Meta<typeof WorkbenchShell>

export default meta
type Story = StoryObj<typeof meta>

export const ProductionWorkspace: Story = {
  globals: {
    viewport: { value: "productionWide", isRotated: false },
  },
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(silkRoadJourneyWithPlans),
      workbenchTab: "preview",
      composerInput: "保留行程调整要求",
    }),
  ],
}

export const DateNavigationWorkspace: Story = {
  globals: {
    viewport: { value: "productionWide", isRotated: false },
  },
  decorators: [
    withWorkspaceState({
      ...cityWorkspaceState(dunhuangRouteStoryJourney, "敦煌"),
      workbenchTab: "preview",
      composerInput: "保留行程调整要求",
      mapFocusRequest: {
        requestId: 1,
        target: { type: "active-journey", maxZoom: 13 },
      },
    }),
  ],
}

export const WorkspaceManagement: Story = {
  render: () => <WorkspaceManagementSurface />,
  globals: {
    viewport: { value: "productionWide", isRotated: false },
  },
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(silkRoadJourneyWithPlans),
      workbenchTab: "chat",
      composerInput: "继续调整这条路线",
    }),
  ],
}

export const WorkspaceManagementRunning: Story = {
  render: () => <WorkspaceManagementSurface />,
  globals: {
    viewport: { value: "productionWide", isRotated: false },
  },
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(silkRoadJourneyWithPlans, {
        locked: true,
      }),
      agentRunStage: "VERIFYING_PLACES",
      workbenchTab: "chat",
    }),
  ],
}

export const PlanningWhileBrowsingWide: Story = {
  globals: {
    viewport: { value: "productionWide", isRotated: false },
  },
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(silkRoadJourneyWithPlans, {
        locked: true,
      }),
      agentRunStage: "VERIFYING_PLACES",
      workbenchTab: "chat",
    }),
  ],
}

export const CommittedUpdateWide: Story = {
  globals: {
    viewport: { value: "productionWide", isRotated: false },
  },
  decorators: [
    (() => {
      const workspaceDocument = workspaceDocumentForStory(
        silkRoadJourneyWithPlans
      )
      return withWorkspaceState({
        workspaceDocument,
        workbenchTab: "preview",
        journeyCommitPresentation: {
          revision: workspaceDocument.session.flatJourney.revision,
          summary: "保留西安与敦煌重点，并把跨城交通顺序调整得更连贯。",
          changedEventIds: workspaceDocument.session.flatJourney.events
            .filter((event) => event.kind !== "TRANSIT")
            .slice(0, 3)
            .map((event) => event.eventId),
        },
      })
    })(),
  ],
}

export const WorkspaceManagementMobile: Story = {
  render: () => <WorkspaceManagementSurface />,
  globals: {
    viewport: { value: "workspaceMobile", isRotated: false },
  },
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(silkRoadJourneyWithPlans),
      workbenchTab: "chat",
      mobileSheetSnap: "expanded",
      composerInput: "继续调整这条路线",
    }),
  ],
}

export const PlanningWhileBrowsingMobile: Story = {
  globals: {
    viewport: { value: "workspaceMobile", isRotated: false },
  },
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(silkRoadJourneyWithPlans, {
        locked: true,
      }),
      agentRunStage: "CHECKING_ROUTE",
      workbenchTab: "preview",
      mobileSheetSnap: "half",
    }),
  ],
}
