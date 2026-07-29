import { describe, expect, it } from "vitest"
import { resolveRouteBadgeCollisions } from "@/lib/routes/route-badges"

describe("route badge collisions", () => {
  it("keeps a selected edge when two labels collide", () => {
    const placements = resolveRouteBadgeCollisions(
      [
        {
          edgeId: "ordinary",
          position: [100, 30],
          isSelected: false,
          priority: 100,
        },
        {
          edgeId: "selected",
          position: [100.01, 30.01],
          isSelected: true,
          priority: 10,
        },
      ],
      ([lng, lat]) => ({ x: lng * 10, y: lat * 10 })
    )

    expect(placements.map((placement) => placement.edgeId)).toEqual([
      "selected",
    ])
  })

  it("keeps multiple labels when their projected positions do not collide", () => {
    const placements = resolveRouteBadgeCollisions(
      [
        {
          edgeId: "edge-1",
          position: [10, 10],
          isSelected: false,
          priority: 20,
        },
        {
          edgeId: "edge-2",
          position: [30, 30],
          isSelected: false,
          priority: 10,
        },
      ],
      ([lng, lat]) => ({ x: lng * 10, y: lat * 10 })
    )

    expect(placements).toHaveLength(2)
  })
})
