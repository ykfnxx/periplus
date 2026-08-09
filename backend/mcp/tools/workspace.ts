import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z, ZodError } from "zod"
import { mcpErrorResult, mcpJsonResult } from "../errors"
import { callWorkspaceBackend } from "../workspace-client"

const workspaceProjectionInputSchema = z.object({
  scopeSectionEventId: z.string().trim().min(1).nullable(),
  mode: z.enum(["PLANNER", "EXECUTION", "TRAVELOGUE"]),
  asOfRevision: z.number().int().positive().optional(),
})

const workspacePlanValidationInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
})

const workspaceDraftValidationInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(1),
  commands: z.array(z.unknown()).min(1).max(40),
  previousDraftId: z.string().trim().min(1).optional(),
})

const workspaceDraftCommitInputSchema = z.object({
  draftId: z.string().trim().min(1),
})

const workspaceTransitPreparationInputSchema = z.object({
  previousDraftId: z.string().trim().min(1),
  idempotencyKey: z.string().trim().min(1),
  eventId: z.string().trim().min(1),
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
    "periplus.workspace.validate_draft",
    {
      title: "Validate journey draft",
      description:
        "Validate an ordered, bounded journey-command draft before it is written. Use the returned allowedOperations and suggestions for at most two repair rounds.",
      inputSchema: workspaceDraftValidationInputSchema.shape,
    },
    async (input) => {
      try {
        const parsed = workspaceDraftValidationInputSchema.parse(input)
        return callWorkspaceBackend({
          type: "workspace.validate_draft",
          ...parsed,
        })
      } catch (error) {
        return errorResult(error)
      }
    }
  )
  server.registerTool(
    "periplus.workspace.commit_draft",
    {
      title: "Commit validated journey draft",
      description:
        "Atomically commit one previously validated, error-free journey draft. Do not use this for a draft with validation errors.",
      inputSchema: workspaceDraftCommitInputSchema.shape,
    },
    async (input) => {
      try {
        const parsed = workspaceDraftCommitInputSchema.parse(input)
        return callWorkspaceBackend({
          type: "workspace.commit_draft",
          ...parsed,
        })
      } catch (error) {
        return errorResult(error)
      }
    }
  )
  server.registerTool(
    "periplus.workspace.prepare_transit",
    {
      title: "Prepare transit for a draft",
      description:
        "Fetch a Transit result for one previous invalid draft, then return a new draft for the normal deterministic validation and commit path.",
      inputSchema: workspaceTransitPreparationInputSchema.shape,
    },
    async (input) => {
      try {
        const parsed = workspaceTransitPreparationInputSchema.parse(input)
        return callWorkspaceBackend({
          type: "workspace.prepare_transit",
          ...parsed,
        })
      } catch (error) {
        return errorResult(error)
      }
    }
  )
}
