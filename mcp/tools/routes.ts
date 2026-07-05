import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { loadProjectEnv } from "@/config/env.server"
import { periplusServerConfig } from "@/config/periplus.server"
import type { AuthContext } from "@/lib/auth-context"
import {
  createRoute,
  deleteRoute,
  getRoute,
  listRoutes,
  updateRoute,
} from "@/lib/routes/service"
import {
  createRouteInputSchema,
  deleteRouteInputSchema,
  getRouteInputSchema,
  listRoutesInputSchema,
  updateRouteInputSchema,
} from "@/mcp/schemas/routes"
import {
  mcpErrorResult,
  mcpJsonResult,
  routeToolErrorResult,
} from "@/mcp/errors"
import type { RouteInput } from "@/types/route"

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
      const data = createRouteInputSchema.parse(input) as RouteInput
      return mcpJsonResult(await createRoute(mcpAuthContext, data))
    } catch (error) {
      return routeToolErrorResult(error)
    }
  },

  async updateRoute(input: ToolInput) {
    try {
      const data = updateRouteInputSchema.parse(input)
      return routeOrNotFound(
        await updateRoute(mcpAuthContext, data.id, data.route as RouteInput),
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
      description: "Create a Periplus route path graph.",
      inputSchema: {},
    },
    (input) => callRouteTool(routeToolHandlers.createRoute, input)
  )

  server.registerTool(
    "periplus.update_route",
    {
      title: "Update route",
      description: "Replace a full Periplus route path graph.",
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
}
