import { describe, expect, it } from "vitest"
import { getActivePathView } from "@/lib/routes/active-path"
import { silkRoadRoute } from "@/lib/mock-routes"

describe("getActivePathView", () => {
  it("returns top-level route nodes in overview", () => {
    const view = getActivePathView(silkRoadRoute, "overview", null)

    expect(view.level).toBe("overview")
    expect(view.nodes).toHaveLength(7)
    expect(view.edges).toHaveLength(6)
    expect(view.title).toBe("丝绸之路")
  })

  it("returns nested subplan nodes in city view", () => {
    const view = getActivePathView(silkRoadRoute, "city", "node-xian")

    expect(view.level).toBe("city")
    expect(view.isEmptyCity).toBe(false)
    expect(view.nodes.map((node) => node.name)).toEqual([
      "西安城墙",
      "大雁塔",
      "回民街",
    ])
    expect(view.edges).toHaveLength(2)
  })

  it("uses the route node as city anchor when subplan is missing", () => {
    const view = getActivePathView(silkRoadRoute, "city", "node-lanzhou")

    expect(view.level).toBe("city")
    expect(view.isEmptyCity).toBe(true)
    expect(view.nodes).toMatchObject([{ id: "node-lanzhou", order: 0 }])
    expect(view.edges).toEqual([])
  })
})
