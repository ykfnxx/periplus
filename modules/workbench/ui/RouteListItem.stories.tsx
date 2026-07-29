import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, fn, userEvent, within } from "storybook/test"
import { silkRoadRoute } from "@/lib/mock-routes"
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
  args: {
    route: silkRoadRoute,
    onSelect: fn(),
  },
} satisfies Meta<typeof RouteListItem>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole("button", { name: /丝绸之路，7 个节点/ })
    )
    await expect(args.onSelect).toHaveBeenCalledWith(silkRoadRoute)
  },
}

export const LongContent: Story = {
  args: {
    route: {
      ...silkRoadRoute,
      name: "一条用于验证标题截断、描述换行和计数布局的超长旅行路线名称",
      description:
        "这个场景用于验证列表项在较窄面板内遇到很长的说明文字时，仍能保持清晰的层级和稳定的按钮尺寸。",
    },
  },
}
