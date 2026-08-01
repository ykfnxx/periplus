import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, within } from "storybook/test"
import { silkRoadJourney } from "@/lib/mock-journeys"
import { TARGET_CONTRACT_FIXTURES } from "@/modules/data-model/contracts/fixtures"
import {
  withWorkspaceState,
  workspaceDocumentForStory,
} from "@/tests/storybook/workspace-story"
import RoutePreview from "./RoutePreview"

const meta = {
  title: "Workbench/RoutePreview",
  component: RoutePreview,
  decorators: [
    (Story) => (
      <div className="h-[720px] w-[380px] overflow-auto rounded-2xl border border-ink-15 bg-soft-white shadow-periplus">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RoutePreview>

export default meta
type Story = StoryObj<typeof meta>

export const Overview: Story = {
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(silkRoadJourney),
    }),
  ],
}

export const Section: Story = {
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(silkRoadJourney),
      viewLevel: "section",
      activeSectionEventId: "section-xian",
    }),
  ],
}

export const Empty: Story = {
  decorators: [withWorkspaceState({ workspaceDocument: null })],
}

const nestedGraph = TARGET_CONTRACT_FIXTURES.find(
  (fixture) => fixture.id === "02-city-day-event-drilldown"
)?.cases[0]?.input.graph
if (!nestedGraph) throw new Error("nested scope fixture is missing")

export const NestedSectionDrilldown: Story = {
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(nestedGraph),
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole("button", { name: "查看城市 杭州" }))
    await userEvent.click(
      canvas.getByRole("button", { name: "进入分组 第一天" })
    )
    await expect(
      canvas.getByRole("button", { name: "选择事件 西湖" })
    ).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "返回上一级" }))
    await expect(
      canvas.getByRole("button", { name: "进入分组 第一天" })
    ).toBeVisible()
  },
}
