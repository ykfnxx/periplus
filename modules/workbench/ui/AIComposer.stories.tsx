import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, userEvent, within } from "storybook/test"
import { silkRoadJourney } from "@/lib/mock-journeys"
import { withWorkspaceState } from "@/tests/storybook/workspace-story"
import AIComposer from "./AIComposer"

const meta = {
  title: "Workbench/AIComposer",
  component: AIComposer,
  decorators: [
    (Story) => (
      <div className="w-[420px] rounded-2xl bg-cream p-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AIComposer>

export default meta
type Story = StoryObj<typeof meta>

const sendReadyEvent = fn()

export const Ready: Story = {
  decorators: [
    withWorkspaceState({
      draftJourney: silkRoadJourney,
      sendAgentEvent: sendReadyEvent,
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const input = canvas.getByRole("textbox", { name: "AI 输入" })

    await userEvent.type(input, "增加一天敦煌停留")
    await userEvent.click(canvas.getByRole("button", { name: "发送" }))

    await expect(sendReadyEvent).toHaveBeenCalledWith("agent.run.start", {
      prompt: "增加一天敦煌停留",
      mode: "auto",
    })
    await expect(input).toHaveValue("")
  },
}

const sendLockedEvent = fn()

export const Running: Story = {
  decorators: [
    withWorkspaceState({
      draftJourney: silkRoadJourney,
      isDraftLocked: true,
      sendAgentEvent: sendLockedEvent,
    }),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole("textbox", { name: "AI 输入" })
    ).toBeDisabled()

    await userEvent.click(canvas.getByRole("button", { name: "停止" }))
    await expect(sendLockedEvent).toHaveBeenCalledWith("agent.run.cancel")
  },
}

export const SaveFailed: Story = {
  decorators: [
    withWorkspaceState({
      draftJourney: silkRoadJourney,
      draftSaveState: "error",
      sendAgentEvent: fn(),
    }),
  ],
}
