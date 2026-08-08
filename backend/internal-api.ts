import type { IncomingMessage, ServerResponse } from "node:http"
import { z } from "zod"
import { agentToolRequestSchema, type AgentGateway } from "./agent/gateway"
import { domainErrorResponse } from "./domain-error"
import { withIncomingTraceContext } from "./observability"
import { WorkspaceInputError } from "@/modules/data/workspaces/workspace-repository"

type JsonBody = Record<string, unknown>

const agentToolBodySchema = z
  .object({
    capabilityToken: z.string().trim().min(1),
    request: agentToolRequestSchema,
  })
  .strict()

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<JsonBody> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  if (!chunks.length) return {}
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new WorkspaceInputError("Request body must be a JSON object")
    }
    return value as JsonBody
  } catch (error) {
    if (error instanceof WorkspaceInputError) throw error
    throw new WorkspaceInputError("Request body must be valid JSON")
  }
}

export function errorResponse(error: unknown) {
  const response = domainErrorResponse(error)
  return {
    status: response.status,
    body: {
      error: {
        code: response.code,
        message: response.message,
        ...(response.issues ? { issues: response.issues } : {}),
      },
    },
  }
}

export async function handleInternalRequest(
  req: IncomingMessage,
  res: ServerResponse,
  agentGateway: AgentGateway
) {
  const url = new URL(req.url ?? "/", "http://periplus.local")
  if (req.method === "POST" && url.pathname === "/internal/agent-tool") {
    try {
      const body = agentToolBodySchema.parse(await readJson(req))
      const result = await withIncomingTraceContext(req.headers, () =>
        agentGateway.executeTool(body.capabilityToken, body.request)
      )
      sendJson(res, 200, { result })
    } catch (error) {
      const response = errorResponse(error)
      sendJson(res, response.status, response.body)
    }
    return
  }
  sendJson(res, 404, {
    error: { code: "not_found", message: "Endpoint not found" },
  })
}
