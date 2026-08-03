import { act, fireEvent, render, screen } from "@testing-library/react"
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

  it("renders persisted hotel and attraction result cards", () => {
    act(() => {
      useWorkspaceStore.setState({
        chatMessages: [
          {
            id: "hotel-message",
            role: "assistant",
            content: "",
            blocks: [
              {
                type: "hotel_search",
                title: "西安酒店推荐",
                fetchedAt: "2026-08-03T00:00:00.000Z",
                candidates: [
                  {
                    candidateId: "hotel-1",
                    provider: "rollinggo",
                    providerHotelId: "1",
                    name: "钟楼酒店",
                    address: "西安市碑林区",
                    startingPrice: { amount: 680, currency: "CNY" },
                    imageUrl: "https://images.example/hotel.jpg",
                    externalUrl: "https://booking.example/hotel/1",
                  },
                ],
              },
              {
                type: "place_search",
                title: "西安地点",
                fetchedAt: "2026-08-03T00:00:01.000Z",
                candidates: [
                  {
                    candidateId: "place-1",
                    name: "兵马俑",
                    category: "SIGHT",
                    imageUrl: "https://images.example/terracotta.jpg",
                  },
                ],
              },
            ],
          },
        ],
      })
    })

    render(<ChatHistory />)

    expect(screen.getByText("钟楼酒店")).toBeVisible()
    expect(screen.getByText("CNY 680 起")).toBeVisible()
    expect(screen.getByRole("link", { name: /查看详情/ })).toHaveAttribute(
      "href",
      "https://booking.example/hotel/1"
    )
    expect(screen.getByAltText("兵马俑")).toHaveAttribute(
      "src",
      "https://images.example/terracotta.jpg"
    )
    fireEvent.error(screen.getByAltText("兵马俑"))
    expect(screen.getByTestId("provider-image-fallback-SIGHT")).toBeVisible()
  })
})
