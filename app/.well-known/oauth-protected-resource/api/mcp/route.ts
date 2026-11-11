import { AGENT_SCOPES } from "@/modules/agent/contracts"
import { agentIssuer, agentResource } from "@/modules/agent/server/oauth"
export function GET() {
  return Response.json(
    {
      resource: agentResource,
      authorization_servers: [agentIssuer],
      scopes_supported: [...AGENT_SCOPES, "offline_access"],
      bearer_methods_supported: ["header"],
    },
    {
      headers: { "Access-Control-Allow-Origin": "*" },
    }
  )
}
