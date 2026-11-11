import {
  authenticateAgent,
  agentAuthResponse,
} from "@/modules/agent/server/access"
import { AgentAuthorizationError } from "@/modules/agent/contracts"
import { agentMcpHandler, mcpAuthInfo } from "@/modules/agent/server/mcp"

export const runtime = "nodejs"
export async function POST(request: Request) {
  try {
    const identity = await authenticateAgent(request)
    return agentMcpHandler(identity).fetch(request, {
      authInfo: mcpAuthInfo(identity),
    })
  } catch (error) {
    if (error instanceof AgentAuthorizationError)
      return agentAuthResponse(error)
    throw error
  }
}
