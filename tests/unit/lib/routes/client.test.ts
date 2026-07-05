import { beforeEach, describe, expect, it, vi } from "vitest"
import { createRoute, getRoute, listRoutes, updateRoute } from "@/lib/routes/client"

const routeInput = {
  name: "杭州三日",
  nodes: [
    {
      id: "node-1",
      name: "灵隐寺",
      lat: 30.2401,
      lng: 120.1023,
      order: 0,
      category: "PLACE" as const,
    },
  ],
  edges: [],
}

describe("route client", () => {
  beforeEach(() => {
    global.fetch = vi.fn()
  })

  it("lists routes through the REST route endpoint", async () => {
    const routes = [{ id: "route-1", name: "杭州三日", nodes: [], edges: [] }]
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => routes,
    } as Response)

    await expect(listRoutes()).resolves.toEqual(routes)
    expect(global.fetch).toHaveBeenCalledWith("/api/routes", {
      cache: "no-store",
    })
  })

  it("gets one route by id through the REST route endpoint", async () => {
    const route = { id: "route-1", name: "杭州三日", nodes: [], edges: [] }
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => route,
    } as Response)

    await expect(getRoute("route-1")).resolves.toEqual(route)
  })

  it("creates routes through the REST route endpoint", async () => {
    const route = { id: "route-1", ...routeInput }
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => route,
    } as Response)

    await expect(createRoute(routeInput)).resolves.toEqual(route)
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/routes",
      expect.objectContaining({ body: JSON.stringify(routeInput) })
    )
  })

  it("updates routes through the REST route endpoint", async () => {
    const route = { id: "route-1", ...routeInput }
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => route,
    } as Response)

    await expect(updateRoute("route-1", routeInput)).resolves.toEqual(route)
  })
})
