import { act, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import { createSilkRoadJourney } from "@/lib/mock-journeys"
import ChatHistory from "@/modules/workbench/ui/ChatHistory"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import { workspaceDocumentForStory } from "@/tests/storybook/workspace-story"

describe("target Workspace chat history", () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
  })

  it("renders pending suggestions from a stable store snapshot", () => {
    const document = workspaceDocumentForStory(
      createSilkRoadJourney({ id: "journey", ownerId: "owner" })
    )
    document.suggestions = [
      {
        id: "suggestion-1",
        workspaceId: document.session.id,
        title: "调整第一天行程",
        summary: "减少一个拥挤景点",
        commandPayloads: [{ name: "journey.update_event" }],
        basedOnWorkspaceRevision: 0,
        status: "PENDING",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ]
    act(() => {
      useWorkspaceStore.getState().applyWorkspaceDocument(document)
    })

    render(<ChatHistory />)

    expect(screen.getByText("调整第一天行程")).toBeVisible()
    expect(screen.getByText("减少一个拥挤景点")).toBeVisible()
  })
})
