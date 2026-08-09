import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { ZodError, type z, type ZodObject, type ZodRawShape } from "zod"
import { mcpErrorResult, mcpJsonResult } from "../errors"
import {
  placeEnrichInputSchema,
  placeResolveInputSchema,
  placeSearchInputSchema,
} from "../schemas/place"
import { callWorkspaceBackend } from "../workspace-client"

type ToolInput = Record<string, unknown>
type McpResult = ReturnType<typeof mcpJsonResult>

function asCallToolResult(result: McpResult): CallToolResult {
  return result as CallToolResult
}

function toolErrorResult(error: unknown): CallToolResult {
  if (error instanceof ZodError) {
    return asCallToolResult(
      mcpErrorResult(
        "invalid_input",
        error.issues.map((issue) => issue.message).join("; ")
      )
    )
  }
  if (error instanceof Error) {
    return asCallToolResult(mcpErrorResult("internal_error", error.message))
  }
  return asCallToolResult(
    mcpErrorResult("internal_error", "Unexpected place tool error")
  )
}

function workspacePlaceHandler<TSchema extends ZodObject<ZodRawShape>>(
  schema: TSchema,
  handler: (input: z.infer<TSchema>) => Promise<CallToolResult>
) {
  return async (input: ToolInput) => {
    try {
      return await handler(schema.parse(input))
    } catch (error) {
      return toolErrorResult(error)
    }
  }
}

function registerPlaceTool(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  schema: ZodObject<ZodRawShape>,
  handler: (input: ToolInput) => Promise<CallToolResult>
) {
  server.registerTool(
    name,
    {
      title,
      description,
      inputSchema: schema.shape,
    },
    (input) => handler(input as ToolInput)
  )
}

export function registerPlaceTools(server: McpServer): void {
  registerPlaceTool(
    server,
    "periplus.place.search",
    "Search places",
    "Search the Periplus place catalog through the current Workspace Agent capability, with optional attributed live-provider fallback.",
    placeSearchInputSchema,
    workspacePlaceHandler(placeSearchInputSchema, (input) =>
      callWorkspaceBackend({ type: "place.search", ...input })
    )
  )
  registerPlaceTool(
    server,
    "periplus.place.resolve",
    "Resolve place",
    "Resolve a user place phrase into one high-confidence place or an ambiguity set.",
    placeResolveInputSchema,
    workspacePlaceHandler(placeResolveInputSchema, (input) =>
      callWorkspaceBackend({ type: "place.resolve", ...input })
    )
  )
  registerPlaceTool(
    server,
    "periplus.place.enrich",
    "Enrich place",
    "Optionally enrich a resolved place handle with currently available images. Missing images return warnings and never block the draft.",
    placeEnrichInputSchema,
    workspacePlaceHandler(placeEnrichInputSchema, (input) =>
      callWorkspaceBackend({ type: "place.enrich", ...input })
    )
  )
}
