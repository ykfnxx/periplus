import { readFileSync } from "node:fs"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { loadProjectEnv } from "@/config/env.server"
import { periplusServerConfig } from "@/config/periplus.server"
import { mcpErrorResult, mcpJsonResult } from "./errors"

loadProjectEnv()

interface WorkspaceMcpRuntimeConfig {
  backendUrl?: string
  capabilityToken?: string
}

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

function result(value: ReturnType<typeof mcpJsonResult>): CallToolResult {
  return value as CallToolResult
}

const runtimeConfig = loadRuntimeConfig()
const backendUrl =
  runtimeConfig.backendUrl ?? periplusServerConfig.agentBackend.url
const capabilityToken = runtimeConfig.capabilityToken

export async function callWorkspaceBackend(
  request: unknown
): Promise<CallToolResult> {
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
