import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { loadProjectEnv } from "@/config/env.server"
import { periplusServerConfig } from "@/config/periplus.server"
import type { AuthContext } from "@/lib/auth-context"
import {
  addRoutePoint,
  createRoute,
  deleteRoute,
  deleteRoutePoint,
  getRoute,
  listRoutes,
  reorderRoutePoints,
  updateRoute,
  updateRoutePoint,
} from "@/lib/routes/service"
import {
  addRoutePointInputSchema,
  createRouteInputSchema,
  deleteRouteInputSchema,
  deleteRoutePointInputSchema,
  getRouteInputSchema,
  listRoutesInputSchema,
  reorderRoutePointsInputSchema,
  updateRouteInputSchema,
  updateRoutePointInputSchema,
} from "@/mcp/schemas/routes"
import {
  mcpErrorResult,
  mcpJsonResult,
  routeToolErrorResult,
} from "@/mcp/errors"

type ToolInput = Record<string, unknown>
type RouteToolHandler = (input: ToolInput) => Promise<unknown>

loadProjectEnv()

const mcpAuthContext: AuthContext = {
  userId: periplusServerConfig.mcp.routeUserId,
  role: "admin",
}

async function routeOrNotFound<T>(route: T | null, message: string) {
  return route ? mcpJsonResult(route) : mcpErrorResult("not_found", message)
}

function callRouteTool(
  handler: RouteToolHandler,
  input: unknown
): Promise<CallToolResult> {
  return handler(input as ToolInput) as Promise<CallToolResult>
}

export const routeToolHandlers = {
  async listRoutes(_input: ToolInput) {
    try {
      return mcpJsonResult(await listRoutes(mcpAuthContext))
    } catch (error) {
      return routeToolErrorResult(error)
    }
  },

  async getRoute(input: ToolInput) {
    try {
      const data = getRouteInputSchema.parse(input)
      return routeOrNotFound(
        await getRoute(mcpAuthContext, data.id),
        "Route not found"
      )
    } catch (error) {
      return routeToolErrorResult(error)
    }
  },

  async createRoute(input: ToolInput) {
    try {
      const data = createRouteInputSchema.parse(input)
      return mcpJsonResult(await createRoute(mcpAuthContext, data))
    } catch (error) {
      return routeToolErrorResult(error)
    }
  },

  async updateRoute(input: ToolInput) {
    try {
      const data = updateRouteInputSchema.parse(input)
      return routeOrNotFound(
        await updateRoute(mcpAuthContext, data.id, data.route),
        "Route not found"
      )
    } catch (error) {
      return routeToolErrorResult(error)
    }
  },

  async deleteRoute(input: ToolInput) {
    try {
      const data = deleteRouteInputSchema.parse(input)
      const deleted = await deleteRoute(mcpAuthContext, data.id)
      return deleted
        ? mcpJsonResult({ deleted: true })
        : mcpErrorResult("not_found", "Route not found")
    } catch (error) {
      return routeToolErrorResult(error)
    }
  },

  async addRoutePoint(input: ToolInput) {
    try {
      const data = addRoutePointInputSchema.parse(input)
      return routeOrNotFound(
        await addRoutePoint(mcpAuthContext, data.routeId, {
          point: data.point,
          position: data.position,
        }),
        "Route not found"
      )
    } catch (error) {
      return routeToolErrorResult(error)
    }
  },

  async updateRoutePoint(input: ToolInput) {
    try {
      const data = updateRoutePointInputSchema.parse(input)
      return routeOrNotFound(
        await updateRoutePoint(mcpAuthContext, data.routeId, data.pointId, {
          patch: data.patch,
          position: data.position,
        }),
        "Route point not found"
      )
    } catch (error) {
      return routeToolErrorResult(error)
    }
  },

  async deleteRoutePoint(input: ToolInput) {
    try {
      const data = deleteRoutePointInputSchema.parse(input)
      return routeOrNotFound(
        await deleteRoutePoint(mcpAuthContext, data.routeId, data.pointId),
        "Route point not found"
      )
    } catch (error) {
      return routeToolErrorResult(error)
    }
  },

  async reorderRoutePoints(input: ToolInput) {
    try {
      const data = reorderRoutePointsInputSchema.parse(input)
      return routeOrNotFound(
        await reorderRoutePoints(mcpAuthContext, data.routeId, data.pointIds),
        "Route not found"
      )
    } catch (error) {
      return routeToolErrorResult(error)
    }
  },
}

export function registerRouteTools(server: McpServer): void {
  server.registerTool(
    "periplus.list_routes",
    {
      title: "List routes",
      description: "List all Periplus routes.",
      inputSchema: listRoutesInputSchema.shape,
    },
    (input) => callRouteTool(routeToolHandlers.listRoutes, input)
  )

  server.registerTool(
    "periplus.get_route",
    {
      title: "Get route",
      description: "Get one Periplus route by id.",
      inputSchema: getRouteInputSchema.shape,
    },
    (input) => callRouteTool(routeToolHandlers.getRoute, input)
  )

  server.registerTool(
    "periplus.create_route",
    {
      title: "Create route",
      description: "Create a Periplus route with ordered points.",
      inputSchema: createRouteInputSchema.shape,
    },
    (input) => callRouteTool(routeToolHandlers.createRoute, input)
  )

  server.registerTool(
    "periplus.update_route",
    {
      title: "Update route",
      description: "Replace a full Periplus route.",
      inputSchema: updateRouteInputSchema.shape,
    },
    (input) => callRouteTool(routeToolHandlers.updateRoute, input)
  )

  server.registerTool(
    "periplus.delete_route",
    {
      title: "Delete route",
      description: "Delete a Periplus route.",
      inputSchema: deleteRouteInputSchema.shape,
    },
    (input) => callRouteTool(routeToolHandlers.deleteRoute, input)
  )

  server.registerTool(
    "periplus.add_route_point",
    {
      title: "Add route point",
      description: "Add a route point at a relative position.",
      inputSchema: addRoutePointInputSchema.shape,
    },
    (input) => callRouteTool(routeToolHandlers.addRoutePoint, input)
  )

  server.registerTool(
    "periplus.update_route_point",
    {
      title: "Update route point",
      description: "Patch a route point and optionally move it.",
      inputSchema: updateRoutePointInputSchema.shape,
    },
    (input) => callRouteTool(routeToolHandlers.updateRoutePoint, input)
  )

  server.registerTool(
    "periplus.delete_route_point",
    {
      title: "Delete route point",
      description: "Delete a route point and normalize route order.",
      inputSchema: deleteRoutePointInputSchema.shape,
    },
    (input) => callRouteTool(routeToolHandlers.deleteRoutePoint, input)
  )

  server.registerTool(
    "periplus.reorder_route_points",
    {
      title: "Reorder route points",
      description:
        "Replace route point ordering with a complete point id list.",
      inputSchema: reorderRoutePointsInputSchema.shape,
    },
    (input) => callRouteTool(routeToolHandlers.reorderRoutePoints, input)
  )
}
