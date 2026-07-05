import { describe, expect, it } from "vitest"
import { mapRouteToDto } from "@/lib/routes/mapper"

describe("mapRouteToDto", () => {
  it("maps Prisma route records to route DTOs", () => {
    const dto = mapRouteToDto({
      id: "route-1",
      ownerId: "user-1",
      name: "杭州三日",
      description: null,
      createdAt: new Date("2026-06-25T08:00:00.000Z"),
      updatedAt: new Date("2026-06-25T09:00:00.000Z"),
      nodes: [
        {
          id: "node-1",
          routeId: "route-1",
          name: "灵隐寺",
          lat: 30.2401,
          lng: 120.1023,
          order: 0,
          category: "PLACE",
          durationMinutes: 90,
          notes: null,
          subPlan: null,
        },
      ],
      edges: [],
    })

    expect(dto.nodes[0]).toMatchObject({
      id: "node-1",
      name: "灵隐寺",
      category: "PLACE",
      durationMinutes: 90,
    })
    expect(dto.subPlans).toEqual([])
  })
})
