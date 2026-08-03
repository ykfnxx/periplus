import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { ZodError } from "zod"
import { mcpErrorResult, mcpJsonResult } from "../errors"
import { hotelSearchInputSchema } from "../schemas/hotel"
import { callWorkspaceBackend } from "../workspace-client"

function result(value: ReturnType<typeof mcpJsonResult>): CallToolResult {
  return value as CallToolResult
}

function errorResult(error: unknown): CallToolResult {
  if (error instanceof ZodError) {
    return result(
      mcpErrorResult(
        "invalid_input",
        error.issues.map((issue) => issue.message).join("; ")
      )
    )
  }
  return result(
    mcpErrorResult(
      "internal_error",
      error instanceof Error ? error.message : "Unexpected hotel tool error"
    )
  )
}

export function registerHotelTools(server: McpServer): void {
  server.registerTool(
    "periplus.hotel.search",
    {
      title: "Search hotel recommendations",
      description:
        "Search RollingGo for up to ten hotel candidates. Use clear destination and stay dates; the Workspace shows the complete result cards while the first valid candidate can be added to the itinerary through a typed command.",
      inputSchema: hotelSearchInputSchema.shape,
    },
    async (input) => {
      try {
        const { requestId, ...hotelInput } = hotelSearchInputSchema.parse(input)
        return callWorkspaceBackend({
          type: "hotel.search",
          requestId,
          input: hotelInput,
        })
      } catch (error) {
        return errorResult(error)
      }
    }
  )
}
