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
        "Search RollingGo for up to ten hotel candidates. The Workspace persists the complete result cards; only the first valid candidate gets a run-scoped hotelSelectionId for draft.add_hotel_stay_card.",
      inputSchema: hotelSearchInputSchema.shape,
    },
    async (input) => {
      try {
        const hotelInput = hotelSearchInputSchema.parse(input)
        return callWorkspaceBackend({
          type: "hotel.search",
          ...hotelInput,
        })
      } catch (error) {
        return errorResult(error)
      }
    }
  )
}
