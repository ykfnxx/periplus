import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import MapSurface from "@/modules/map-renderer/ui/MapSurface"
import { dispatchMapIntent } from "@/modules/workspace/ui/WorkspaceController"
import WorkspaceInteractionLayer from "@/modules/workspace/ui/WorkspaceInteractionLayer"
import {
  dunhuangRouteStoryJourney,
  silkRoadJourneyWithPlans,
} from "@/tests/storybook/route-fixtures"
import {
  withWorkspaceState,
  workspaceDocumentForStory,
} from "@/tests/storybook/workspace-story"
import WorkbenchShell from "./WorkbenchShell"

function ProductionWorkbenchSurface() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-cream text-ink">
      <MapSurface onIntent={dispatchMapIntent} />
      <WorkspaceInteractionLayer />
    </div>
  )
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
      workspaceDocument: workspaceDocumentForStory(dunhuangRouteStoryJourney),
      viewLevel: "section",
      activeSectionEventId: "section-dunhuang",
      workbenchTab: "preview",
      composerInput: "保留行程调整要求",
      mapFocusRequest: {
        requestId: 1,
        target: { type: "active-journey", maxZoom: 13 },
      },
    }),
  ],
}
