import { readFileSync } from "node:fs"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { ZodError, type ZodObject, type ZodRawShape } from "zod"
import { loadProjectEnv } from "@/config/env.server"
import { periplusServerConfig } from "@/config/periplus.server"
import type { DraftToolName } from "@/modules/workspace/server/contracts"
import { mcpErrorResult, mcpJsonResult } from "../errors"
import {
  appendNodeInputSchema,
  getCurrentDraftInputSchema,
  insertNodeInputSchema,
  linkPlaceToNodeInputSchema,
  removeNodeRangeInputSchema,
  replaceDraftInputSchema,
  planEdgeInputSchema,
  routeAddStartNodeInputSchema,
  subPlanCreateInputSchema,
  subPlanInsertNodeInputSchema,
  subPlanNodeInputSchema,
  subPlanRemoveNodeRangeInputSchema,
  subPlanUpdateEdgeInputSchema,
  subPlanUpdateNodeInputSchema,
  updateEdgeInputSchema,
  updateNodeInputSchema,
  selectRoutePlanInputSchema,
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
  tool: DraftToolName,
  input: unknown
): Promise<CallToolResult> {
  if (!sessionId)
    return asCallToolResult(
      mcpErrorResult("invalid_session", "Draft MCP session id is required")
    )

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
  tool: DraftToolName,
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
  getCurrentDraft: draftHandler(
    "get_current_draft",
    getCurrentDraftInputSchema
  ),
  replaceDraft: draftHandler("replace_draft", replaceDraftInputSchema),
  routeAddStartNode: draftHandler(
    "route.add_start_node",
    routeAddStartNodeInputSchema
  ),
  routeAppendNode: draftHandler("route.append_node", appendNodeInputSchema),
  routeInsertNode: draftHandler("route.insert_node", insertNodeInputSchema),
  routeRemoveNodeRange: draftHandler(
    "route.remove_node_range",
    removeNodeRangeInputSchema
  ),
  routeUpdateNode: draftHandler("route.update_node", updateNodeInputSchema),
  routeUpdateEdge: draftHandler("route.update_edge", updateEdgeInputSchema),
  routeLinkPlaceToNode: draftHandler(
    "route.link_place_to_node",
    linkPlaceToNodeInputSchema
  ),
  routePlanEdge: draftHandler("route.plan_edge", planEdgeInputSchema),
  routeSelectPlan: draftHandler(
    "route.select_plan",
    selectRoutePlanInputSchema
  ),
  subPlanCreate: draftHandler("subplan.create", subPlanCreateInputSchema),
  subPlanAddStartNode: draftHandler(
    "subplan.add_start_node",
    subPlanNodeInputSchema
  ),
  subPlanAppendNode: draftHandler(
    "subplan.append_node",
    subPlanNodeInputSchema
  ),
  subPlanInsertNode: draftHandler(
    "subplan.insert_node",
    subPlanInsertNodeInputSchema
  ),
  subPlanRemoveNodeRange: draftHandler(
    "subplan.remove_node_range",
    subPlanRemoveNodeRangeInputSchema
  ),
  subPlanUpdateNode: draftHandler(
    "subplan.update_node",
    subPlanUpdateNodeInputSchema
  ),
  subPlanUpdateEdge: draftHandler(
    "subplan.update_edge",
    subPlanUpdateEdgeInputSchema
  ),
}

function callTool(
  handler: (input: ToolInput) => Promise<CallToolResult>,
  input: unknown
) {
  return handler(input as ToolInput)
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
    {
      title,
      description,
      inputSchema: schema.shape,
    },
    (input) => callTool(handler, input)
  )
}

export function registerDraftTools(server: McpServer): void {
  registerDraftTool(
    server,
    "periplus.get_current_draft",
    "Get current draft",
    "Read the current Periplus draft route for this session.",
    getCurrentDraftInputSchema,
    draftToolHandlers.getCurrentDraft
  )
  registerDraftTool(
    server,
    "periplus.replace_draft",
    "Replace draft",
    "Replace the full current draft route without saving it.",
    replaceDraftInputSchema,
    draftToolHandlers.replaceDraft
  )
  registerDraftTool(
    server,
    "periplus.route.add_start_node",
    "Add route start node",
    "Create the first node for an empty route path graph.",
    routeAddStartNodeInputSchema,
    draftToolHandlers.routeAddStartNode
  )
  registerDraftTool(
    server,
    "periplus.route.append_node",
    "Append route node",
    "Append a node to the route path with an incoming edge.",
    appendNodeInputSchema,
    draftToolHandlers.routeAppendNode
  )
  registerDraftTool(
    server,
    "periplus.route.insert_node",
    "Insert route node",
    "Insert a node before an existing route node with explicit new edges.",
    insertNodeInputSchema,
    draftToolHandlers.routeInsertNode
  )
  registerDraftTool(
    server,
    "periplus.route.remove_node_range",
    "Remove route node range",
    "Remove a continuous range of route nodes, with bridge edge when needed.",
    removeNodeRangeInputSchema,
    draftToolHandlers.routeRemoveNodeRange
  )
  registerDraftTool(
    server,
    "periplus.route.update_node",
    "Update route node",
    "Patch route node fields.",
    updateNodeInputSchema,
    draftToolHandlers.routeUpdateNode
  )
  registerDraftTool(
    server,
    "periplus.route.update_edge",
    "Update route edge",
    "Patch route edge fields.",
    updateEdgeInputSchema,
    draftToolHandlers.routeUpdateEdge
  )
  registerDraftTool(
    server,
    "periplus.route.link_place_to_node",
    "Link place to route node",
    "Link a resolved place result to an existing route or subplan node.",
    linkPlaceToNodeInputSchema,
    draftToolHandlers.routeLinkPlaceToNode
  )
  registerDraftTool(
    server,
    "periplus.route.plan_edge",
    "Plan real route edge",
    "Resolve an edge through the configured map provider and attach real route alternatives, segments, distance, and duration to the current draft.",
    planEdgeInputSchema,
    draftToolHandlers.routePlanEdge
  )
  registerDraftTool(
    server,
    "periplus.route.select_plan",
    "Select route alternative",
    "Select one of the resolved route alternatives for an edge.",
    selectRoutePlanInputSchema,
    draftToolHandlers.routeSelectPlan
  )
  registerDraftTool(
    server,
    "periplus.subplan.create",
    "Create subplan",
    "Create an empty or populated subplan for a route node.",
    subPlanCreateInputSchema,
    draftToolHandlers.subPlanCreate
  )
  registerDraftTool(
    server,
    "periplus.subplan.add_start_node",
    "Add subplan start node",
    "Create the first node for an empty subplan path graph.",
    subPlanNodeInputSchema,
    draftToolHandlers.subPlanAddStartNode
  )
  registerDraftTool(
    server,
    "periplus.subplan.append_node",
    "Append subplan node",
    "Append a node to a subplan path with an incoming edge.",
    subPlanNodeInputSchema,
    draftToolHandlers.subPlanAppendNode
  )
  registerDraftTool(
    server,
    "periplus.subplan.insert_node",
    "Insert subplan node",
    "Insert a node before an existing subplan node with explicit new edges.",
    subPlanInsertNodeInputSchema,
    draftToolHandlers.subPlanInsertNode
  )
  registerDraftTool(
    server,
    "periplus.subplan.remove_node_range",
    "Remove subplan node range",
    "Remove a continuous range of subplan nodes, with bridge edge when needed.",
    subPlanRemoveNodeRangeInputSchema,
    draftToolHandlers.subPlanRemoveNodeRange
  )
  registerDraftTool(
    server,
    "periplus.subplan.update_node",
    "Update subplan node",
    "Patch subplan node fields.",
    subPlanUpdateNodeInputSchema,
    draftToolHandlers.subPlanUpdateNode
  )
  registerDraftTool(
    server,
    "periplus.subplan.update_edge",
    "Update subplan edge",
    "Patch subplan edge fields.",
    subPlanUpdateEdgeInputSchema,
    draftToolHandlers.subPlanUpdateEdge
  )
}
