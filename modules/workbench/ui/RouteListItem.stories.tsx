import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { fn } from "storybook/test"
import { silkRoadJourney } from "@/lib/mock-journeys"
import RouteListItem from "./RouteListItem"

const meta = {
  title: "Workbench/RouteListItem",
  component: RouteListItem,
  decorators: [
    (Story) => (
      <div className="w-[360px] rounded-2xl bg-cream p-4">
        <Story />
      </div>
    ),
  ],
  args: { journey: silkRoadJourney, onSelect: fn() },
} satisfies Meta<typeof RouteListItem>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const LongContent: Story = {
  args: {
    journey: {
      ...silkRoadJourney,
      title: "一条用于验证标题截断、描述换行和计数布局的超长旅行路线名称",
      description: "较窄面板内的超长说明文字仍应保持清晰层级。",
    },
  },
}
