import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, userEvent, within } from "storybook/test"
import { withWorkspaceState } from "@/tests/storybook/workspace-story"
import { silkRoadJourney } from "@/lib/mock-journeys"
import { workspaceDocumentForStory } from "@/tests/storybook/workspace-story"
import PresetPromptBubbles from "./PresetPromptBubbles"

const meta = {
  title: "Workbench/PresetPromptBubbles",
  component: PresetPromptBubbles,
  decorators: [
    (Story) => (
      <div className="w-[420px] overflow-hidden rounded-2xl bg-cream py-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PresetPromptBubbles>

export default meta
type Story = StoryObj<typeof meta>

const sendAgentEvent = fn()

export const Ready: Story = {
  decorators: [
    withWorkspaceState({
      sendAgentEvent,
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole("button", { name: "规划一条丝绸之路路线" })
    )

    await expect(sendAgentEvent).toHaveBeenCalledWith("agent.run.start", {
      prompt: "规划一条丝绸之路路线",
      mode: "auto",
    })
  },
}

export const WorkspaceLocked: Story = {
  decorators: [
    withWorkspaceState({
      workspaceDocument: workspaceDocumentForStory(silkRoadJourney, {
        locked: true,
      }),
      sendAgentEvent: fn(),
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const prompts = canvas.getAllByRole("button")

    await expect(prompts).toHaveLength(4)
    for (const prompt of prompts) {
      await expect(prompt).toBeDisabled()
    }
  },
}
