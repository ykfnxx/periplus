import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z, ZodError } from "zod"
import { targetCommandBodySchema } from "@/modules/data-model/contracts"
import { mcpErrorResult, mcpJsonResult } from "../errors"
import { callWorkspaceBackend } from "../workspace-client"

const workspaceCommandInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(1),
  command: targetCommandBodySchema,
})

const workspaceProjectionInputSchema = z.object({
  scopeSectionEventId: z.string().trim().min(1).nullable(),
  mode: z.enum(["PLANNER", "EXECUTION", "TRAVELOGUE"]),
  asOfRevision: z.number().int().positive().optional(),
})

const workspacePlanValidationInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
})

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
      error instanceof Error ? error.message : "Unexpected Workspace tool error"
    )
  )
}

export function registerWorkspaceTools(server: McpServer): void {
  server.registerTool(
    "periplus.workspace.get",
    {
      title: "Get current Workspace",
      description:
        "Read the persistent Workspace document and its headWorkspaceRevision.",
      inputSchema: {},
    },
    async () => callWorkspaceBackend({ type: "workspace.get" })
  )
  server.registerTool(
    "periplus.workspace.project",
    {
      title: "Resolve ordered Workspace projection",
      description:
        "Resolve the only authoritative ordered route/ordinal/time/branch view for one scope and mode.",
      inputSchema: workspaceProjectionInputSchema.shape,
    },
    async (input) => {
      try {
        const parsed = workspaceProjectionInputSchema.parse(input)
        return callWorkspaceBackend({
          type: "workspace.project",
          ...parsed,
        })
      } catch (error) {
        return errorResult(error)
      }
    }
  )
  server.registerTool(
    "periplus.workspace.validate_plan",
    {
      title: "Validate current journey plan",
      description:
        "Validate the current two-scope journey topology, local-day grouping, and Transit readiness.",
      inputSchema: workspacePlanValidationInputSchema.shape,
    },
    async (input) => {
      try {
        const parsed = workspacePlanValidationInputSchema.parse(input)
        return callWorkspaceBackend({
          type: "workspace.validate_plan",
          ...parsed,
        })
      } catch (error) {
        return errorResult(error)
      }
    }
  )
  server.registerTool(
    "periplus.workspace.command",
    {
      title: "Execute Workspace command",
      description:
        "Execute one typed command with optimistic concurrency and idempotency.",
      inputSchema: workspaceCommandInputSchema.shape,
    },
    async (input) => {
      try {
        const parsed = workspaceCommandInputSchema.parse(input)
        return callWorkspaceBackend({
          type: "workspace.command",
          ...parsed,
        })
      } catch (error) {
        return errorResult(error)
      }
    }
  )
}
