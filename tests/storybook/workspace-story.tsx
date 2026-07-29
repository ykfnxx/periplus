import type { Decorator } from "@storybook/nextjs-vite"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { WorkspaceState } from "@/modules/workspace/state/types"

export function withWorkspaceState(state: Partial<WorkspaceState>): Decorator {
  return function WorkspaceStateDecorator(Story) {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
    useWorkspaceStore.setState(state)

    return <Story />
  }
}
