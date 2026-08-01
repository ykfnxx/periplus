import { readFileSync } from "node:fs"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { z, ZodError } from "zod"
import { loadProjectEnv } from "@/config/env.server"
import { periplusServerConfig } from "@/config/periplus.server"
import { targetCommandBodySchema } from "@/modules/data-model/contracts"
import { mcpErrorResult, mcpJsonResult } from "../errors"

loadProjectEnv()

interface WorkspaceMcpRuntimeConfig {
  backendUrl?: string
  capabilityToken?: string
}

const workspaceCommandInputSchema = z.object({
  expectedRevision: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(1),
  command: targetCommandBodySchema,
})

function getArgValue(name: string) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function loadRuntimeConfig(): WorkspaceMcpRuntimeConfig {
  const configPath = getArgValue("--config")
  if (!configPath) return {}
  return JSON.parse(
    readFileSync(configPath, "utf8")
  ) as WorkspaceMcpRuntimeConfig
}

const runtimeConfig = loadRuntimeConfig()
const backendUrl =
  runtimeConfig.backendUrl ?? periplusServerConfig.agentBackend.url
const capabilityToken = runtimeConfig.capabilityToken

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

async function callWorkspaceBackend(request: unknown): Promise<CallToolResult> {
  if (!capabilityToken) {
    return result(
      mcpErrorResult(
        "invalid_capability",
        "Workspace MCP capability token is required"
      )
    )
  }
  const response = await fetch(`${backendUrl}/internal/agent-tool`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ capabilityToken, request }),
  })
  const body = (await response.json()) as {
    result?: unknown
    error?: { code: string; message: string }
  }
  if (!response.ok || body.error) {
    return result(
      mcpErrorResult(
        body.error?.code ?? "internal_error",
        body.error?.message ?? "Workspace tool failed"
      )
    )
  }
  return result(mcpJsonResult(body.result))
}

export function registerDraftTools(server: McpServer): void {
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
