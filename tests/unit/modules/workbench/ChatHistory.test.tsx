import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import ChatHistory from "@/modules/workbench/ui/ChatHistory"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"

describe("target Workspace chat history", () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState(), true)
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
