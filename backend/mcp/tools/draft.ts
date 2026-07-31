import { readFileSync } from "node:fs"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { ZodError, type ZodObject, type ZodRawShape } from "zod"
import { loadProjectEnv } from "@/config/env.server"
import { periplusServerConfig } from "@/config/periplus.server"
import type { JourneyToolName } from "@/modules/workspace/server/contracts"
import { mcpErrorResult, mcpJsonResult } from "../errors"
import {
  addJourneyEventInputSchema,
  getCurrentJourneyInputSchema,
  linkPlaceInputSchema,
  moveJourneyEventInputSchema,
  planTransitInputSchema,
  removeJourneyEventInputSchema,
  replaceJourneyEventInputSchema,
  replaceJourneyInputSchema,
  selectTransitPlanInputSchema,
  undoJourneyInputSchema,
  updateJourneyEventInputSchema,
} from "../schemas/draft"

type ToolInput = Record<string, unknown>
type McpResult = ReturnType<typeof mcpJsonResult>

loadProjectEnv()

interface DraftMcpRuntimeConfig {
  backendUrl?: string
  sessionId?: string
}

function getArgValue(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function loadRuntimeConfig(): DraftMcpRuntimeConfig {
  const configPath = getArgValue("--config")
  if (!configPath) return {}
  return JSON.parse(readFileSync(configPath, "utf8")) as DraftMcpRuntimeConfig
}

const runtimeConfig = loadRuntimeConfig()
const backendUrl =
  runtimeConfig.backendUrl ?? periplusServerConfig.agentBackend.url
const sessionId = runtimeConfig.sessionId

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
    mcpErrorResult("internal_error", "Unexpected draft tool error")
  )
}

async function callDraftBackend(
  tool: JourneyToolName,
  input: unknown
): Promise<CallToolResult> {
  if (!sessionId) {
    return asCallToolResult(
      mcpErrorResult("invalid_session", "Draft MCP session id is required")
    )
  }
  const response = await fetch(`${backendUrl}/internal/draft-tool`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, tool, input }),
  })
  const body = (await response.json()) as {
    result?: unknown
    error?: { code: string; message: string }
  }
  if (!response.ok || body.error) {
    return asCallToolResult(
      mcpErrorResult(
        body.error?.code ?? "internal_error",
        body.error?.message ?? "Draft tool failed"
      )
    )
  }
  return asCallToolResult(mcpJsonResult(body.result))
}

function draftHandler<TSchema extends ZodObject<ZodRawShape>>(
  tool: JourneyToolName,
  schema: TSchema
) {
  return async (input: ToolInput) => {
    try {
      return callDraftBackend(tool, schema.parse(input))
    } catch (error) {
      return toolErrorResult(error)
    }
  }
}

export const draftToolHandlers = {
  getCurrentJourney: draftHandler(
    "get_current_journey",
    getCurrentJourneyInputSchema
  ),
  replaceJourney: draftHandler("replace_journey", replaceJourneyInputSchema),
  addEvent: draftHandler("journey.add_event", addJourneyEventInputSchema),
  moveEvent: draftHandler("journey.move_event", moveJourneyEventInputSchema),
  removeEvent: draftHandler(
    "journey.remove_event",
    removeJourneyEventInputSchema
  ),
  updateEvent: draftHandler(
    "journey.update_event",
    updateJourneyEventInputSchema
  ),
  replaceEvent: draftHandler(
    "journey.replace_event",
    replaceJourneyEventInputSchema
  ),
  linkPlace: draftHandler("journey.link_place", linkPlaceInputSchema),
  planTransit: draftHandler("journey.plan_transit", planTransitInputSchema),
  selectTransitPlan: draftHandler(
    "journey.select_transit_plan",
    selectTransitPlanInputSchema
  ),
  undo: draftHandler("journey.undo", undoJourneyInputSchema),
}

function registerDraftTool(
  server: McpServer,
  name: string,
  title: string,
  description: string,
  schema: ZodObject<ZodRawShape>,
  handler: (input: ToolInput) => Promise<CallToolResult>
) {
  server.registerTool(
    name,
    { title, description, inputSchema: schema.shape },
    (input) => handler(input as ToolInput)
  )
}

export function registerDraftTools(server: McpServer): void {
  registerDraftTool(
    server,
    "periplus.get_current_journey",
    "Get current journey",
    "Read the current typed JourneyEvent graph for this session.",
    getCurrentJourneyInputSchema,
    draftToolHandlers.getCurrentJourney
  )
  registerDraftTool(
    server,
    "periplus.replace_journey",
    "Replace journey",
    "Replace the current draft journey without saving it.",
    replaceJourneyInputSchema,
    draftToolHandlers.replaceJourney
  )
  registerDraftTool(
    server,
    "periplus.journey.add_event",
    "Add journey event",
    "Add a typed event at a position in one journey scope.",
    addJourneyEventInputSchema,
    draftToolHandlers.addEvent
  )
  registerDraftTool(
    server,
    "periplus.journey.move_event",
    "Move journey event",
    "Move an event within or across scopes and atomically reconnect topology.",
    moveJourneyEventInputSchema,
    draftToolHandlers.moveEvent
  )
  registerDraftTool(
    server,
    "periplus.journey.remove_event",
    "Remove journey event",
    "Remove one event; non-empty sections require explicit cascade.",
    removeJourneyEventInputSchema,
    draftToolHandlers.removeEvent
  )
  registerDraftTool(
    server,
    "periplus.journey.update_event",
    "Update journey event",
    "Patch common or type-specific fields without changing event type.",
    updateJourneyEventInputSchema,
    draftToolHandlers.updateEvent
  )
  registerDraftTool(
    server,
    "periplus.journey.replace_event",
    "Replace journey event",
    "Preserve the old event and put a typed replacement in its topology slot.",
    replaceJourneyEventInputSchema,
    draftToolHandlers.replaceEvent
  )
  registerDraftTool(
    server,
    "periplus.journey.link_place",
    "Link place",
    "Attach a resolved place and coordinates to a location-bearing event.",
    linkPlaceInputSchema,
    draftToolHandlers.linkPlace
  )
  registerDraftTool(
    server,
    "periplus.journey.plan_transit",
    "Plan transit",
    "Resolve and attach real route alternatives to a TRANSIT event.",
    planTransitInputSchema,
    draftToolHandlers.planTransit
  )
  registerDraftTool(
    server,
    "periplus.journey.select_transit_plan",
    "Select transit plan",
    "Select one resolved route alternative for a TRANSIT event.",
    selectTransitPlanInputSchema,
    draftToolHandlers.selectTransitPlan
  )
  registerDraftTool(
    server,
    "periplus.journey.undo",
    "Undo journey change",
    "Undo one or more typed draft commands using the revision log.",
    undoJourneyInputSchema,
    draftToolHandlers.undo
  )
}
