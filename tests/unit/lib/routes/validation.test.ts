import { describe, expect, it } from "vitest"
import { validateRouteInput } from "@/lib/routes/validation"

const validRoute = {
  name: "杭州三日",
  nodes: [
    {
      id: "node-1",
      name: "西湖",
      lat: 30.246,
      lng: 120.146,
      order: 0,
      category: "PLACE",
    },
    {
      id: "node-2",
      name: "灵隐寺",
      lat: 30.24,
      lng: 120.102,
      order: 1,
      category: "PLACE",
    },
  ],
  edges: [
    {
      id: "edge-1",
      fromNodeId: "node-1",
      toNodeId: "node-2",
      status: "INCOMPLETE",
    },
  ],
}

describe("validateRouteInput", () => {
  it("accepts a valid route path graph", () => {
    expect(validateRouteInput(validRoute).ok).toBe(true)
  })

  it("rejects disconnected edges", () => {
    const result = validateRouteInput({
      ...validRoute,
      edges: [
        {
          id: "edge-1",
          fromNodeId: "node-2",
          toNodeId: "node-1",
          status: "INCOMPLETE",
        },
      ],
    })

    expect(result.ok).toBe(false)
  })

  it("requires transport mode for planned edges", () => {
    const result = validateRouteInput({
      ...validRoute,
      edges: [{ ...validRoute.edges[0], status: "PLANNED" }],
    })

    expect(result.ok).toBe(false)
  })
})
