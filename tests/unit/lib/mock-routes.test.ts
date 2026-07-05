import { describe, expect, it } from "vitest"
import { silkRoadRoute } from "@/lib/mock-routes"

describe("silkRoadRoute", () => {
  it("has 7 nodes and adjacent edges", () => {
    expect(silkRoadRoute.nodes).toHaveLength(7)
    expect(silkRoadRoute.edges).toHaveLength(6)
    expect(silkRoadRoute.nodes.map((node) => node.order)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ])
  })

  it("first node is 西安 and last is 乌鲁木齐", () => {
    const sorted = [...silkRoadRoute.nodes].sort((a, b) => a.order - b.order)
    expect(sorted[0].name).toBe("西安")
    expect(sorted[6].name).toBe("乌鲁木齐")
  })
})
