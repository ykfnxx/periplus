import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { ZodError, type z, type ZodObject, type ZodRawShape } from "zod"
import { createPlaceIntelligenceService } from "@/modules/data/places/place-service"
import { mcpErrorResult, mcpJsonResult } from "../errors"
import {
  eventSearchInputSchema,
  placeEnrichInputSchema,
  placeResolveInputSchema,
  placeResolveForRouteInputSchema,
  placeSearchInputSchema,
} from "../schemas/place"

type ToolInput = Record<string, unknown>
type McpResult = ReturnType<typeof mcpJsonResult>

const service = createPlaceIntelligenceService()

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

function placeHandler<TSchema extends ZodObject<ZodRawShape>>(
  schema: TSchema,
  handler: (input: z.infer<TSchema>) => Promise<unknown>
) {
  return async (input: ToolInput) => {
    try {
      return asCallToolResult(mcpJsonResult(await handler(schema.parse(input))))
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
    "Search the Periplus place catalog with optional live map-provider fallback.",
    placeSearchInputSchema,
    placeHandler(placeSearchInputSchema, (input) => service.searchPlaces(input))
  )
  registerPlaceTool(
    server,
    "periplus.place.resolve_for_route",
    "Resolve place for route",
    "Resolve a place and return a ready-to-call route.link_place_to_node payload.",
    placeResolveForRouteInputSchema,
    placeHandler(placeResolveForRouteInputSchema, (input) =>
      service.resolvePlaceForRoute(input)
    )
  )
  registerPlaceTool(
    server,
    "periplus.place.resolve",
    "Resolve place",
    "Resolve a user place phrase into one high-confidence place or an ambiguity set.",
    placeResolveInputSchema,
    placeHandler(placeResolveInputSchema, (input) =>
      service.resolvePlace(input)
    )
  )
  registerPlaceTool(
    server,
    "periplus.place.enrich",
    "Enrich place",
    "Return currently known enrichment details for a catalog place.",
    placeEnrichInputSchema,
    placeHandler(placeEnrichInputSchema, (input) => service.enrichPlace(input))
  )
  registerPlaceTool(
    server,
    "periplus.event.search",
    "Search events",
    "Reserved event-search interface for future activity providers.",
    eventSearchInputSchema,
    placeHandler(eventSearchInputSchema, async (input) => ({
      results: [],
      warnings: [
        {
          provider: "periplus",
          code: "provider_error",
          message: "活动搜索 provider 尚未接入",
        },
      ],
      fallbackQuery: input,
    }))
  )
}
