import { describe, expect, it } from "vitest"
import { routeToolHandlers } from "@/mcp/tools/routes"

describe("routeToolHandlers", () => {
  it("exposes route CRUD handlers", () => {
    expect(routeToolHandlers).toHaveProperty("listRoutes")
    expect(routeToolHandlers).toHaveProperty("getRoute")
    expect(routeToolHandlers).toHaveProperty("createRoute")
    expect(routeToolHandlers).toHaveProperty("updateRoute")
    expect(routeToolHandlers).toHaveProperty("deleteRoute")
  })
})
