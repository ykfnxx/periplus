import type { IncomingMessage, ServerResponse } from "node:http"
import type { AgentGateway, AgentToolRequest } from "./agent/gateway"
import { domainErrorResponse } from "./domain-error"
import { WorkspaceInputError } from "@/modules/data/workspaces/workspace-repository"

type JsonBody = Record<string, unknown>

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage): Promise<JsonBody> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonBody
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
      const body = await readJson(req)
      if (typeof body.capabilityToken !== "string") {
        throw new WorkspaceInputError("Agent capability token is required")
      }
      const result = await agentGateway.executeTool(
        body.capabilityToken,
        body.request as AgentToolRequest
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
