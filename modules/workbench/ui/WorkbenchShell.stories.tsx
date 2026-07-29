import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, within } from "storybook/test"
import { silkRoadRouteWithPlans } from "@/tests/storybook/route-fixtures"
import { withWorkspaceState } from "@/tests/storybook/workspace-story"
import WorkbenchShell from "./WorkbenchShell"

const meta = {
  title: "Workbench/WorkbenchShell",
  component: WorkbenchShell,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => (
      <div className="relative h-screen min-h-[720px] w-screen overflow-hidden bg-cream">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WorkbenchShell>

export default meta
type Story = StoryObj<typeof meta>

export const CompactTabs: Story = {
  decorators: [
    withWorkspaceState({
      draftRoute: silkRoadRouteWithPlans,
      workbenchTab: "preview",
      composerInput: "保留行程调整要求",
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole("tab", { name: "行程", selected: true })
    ).toBeInTheDocument()
    await expect(canvas.getByText("路线总览")).toBeInTheDocument()

    await userEvent.click(canvas.getByRole("tab", { name: "问问 AI" }))
    await expect(canvas.getByLabelText("AI 初始输入")).toHaveValue(
      "保留行程调整要求"
    )

    await userEvent.click(canvas.getByRole("tab", { name: "行程" }))
    await expect(canvas.getByText("路线总览")).toBeInTheDocument()
  },
}
