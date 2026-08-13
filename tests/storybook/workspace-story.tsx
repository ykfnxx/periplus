import type { Decorator } from "@storybook/nextjs-vite"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type { WorkspaceState } from "@/modules/workspace/state/types"
import type {
  TargetJourneyGraphSnapshot,
  TargetWorkspaceDocument,
} from "@/modules/data-model/contracts"
import { projectFlatJourney } from "@/modules/data/journeys/flat-journey-projection"

const storyTimestamp = "2026-07-29T00:00:00.000Z"

export function workspaceDocumentForStory(
  graph: TargetJourneyGraphSnapshot,
  options: { locked?: boolean } = {}
): TargetWorkspaceDocument {
  return {
    session: {
      id: "storybook-workspace",
      ownerId: graph.ownerId,
      sourceJourneyId: null,
      baseJourneyRevision: null,
      headWorkspaceRevision: 0,
      status: "ACTIVE",
      title: "新工作区",
      headGraph: graph,
      flatJourney: projectFlatJourney(graph, 0),
      lastAccessAt: storyTimestamp,
      createdAt: storyTimestamp,
      updatedAt: storyTimestamp,
    },
    accessState: "OWNER",
    draftState: "DIRTY",
    messages: [],
    agentRuns: options.locked
      ? [
          {
            id: "storybook-agent-run",
            workspaceId: "storybook-workspace",
            status: "RUNNING",
            runtimeOwnerId: "storybook-runtime",
            heartbeatAt: storyTimestamp,
            leaseExpiresAt: "2026-07-29T00:01:00.000Z",
            startedAt: storyTimestamp,
            createdAt: storyTimestamp,
            updatedAt: storyTimestamp,
          },
        ]
      : [],
  }
}

export function withWorkspaceState(state: Partial<WorkspaceState>): Decorator {
  return function WorkspaceStateDecorator(Story) {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
    useWorkspaceStore.setState(state)

    return <Story />
  }
}
