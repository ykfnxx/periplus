import { isAPIError } from "better-auth/api"
import { prisma } from "@/modules/data/db/prisma"
import { auth } from "@/modules/auth/server/auth"
import { AgentAuthorizationError, type AgentScope } from "../contracts"
import { requireAgentGrant } from "./grants"
import { agentIssuer, agentResource } from "./oauth"

export async function authenticateAgent(
  request: Request,
  required: readonly AgentScope[] = ["journey:read"]
) {
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(agentResource).origin) {
    throw new AgentAuthorizationError("Origin is not allowed", 403)
  }
  const authorization = request.headers.get("authorization")
  const match = authorization?.match(/^Bearer (\S+)$/i)
  if (!match)
    throw new AgentAuthorizationError("Bearer access token is required")
  let claims
  try {
    claims = await auth.api.verifyAgentAccessToken({
      body: { token: match[1] },
    })
  } catch (error) {
    if (isAPIError(error) && error.statusCode < 500) {
      throw new AgentAuthorizationError("Access token is not active")
    }
    throw error
  }
  const audience = typeof claims.aud === "string" ? [claims.aud] : claims.aud
  if (
    claims.iss !== agentIssuer ||
    !audience?.includes(agentResource) ||
    typeof claims.sub !== "string" ||
    typeof claims.grant_id !== "string"
  ) {
    throw new AgentAuthorizationError("Access token is not for this resource")
  }
  const scopes = typeof claims.scope === "string" ? claims.scope.split(" ") : []
  if (required.some((scope) => !scopes.includes(scope))) {
    throw new AgentAuthorizationError(
      "Additional permission is required",
      403,
      required
    )
  }
  const grant = await requireAgentGrant(claims.grant_id, claims.sub, required)
  if (grant.clientId !== claims.client_id)
    throw new AgentAuthorizationError("Client does not match authorization")
  await prisma.agentGrant.update({
    where: { id: grant.id },
    data: { lastUsedAt: new Date() },
  })
  return {
    context: {
      userId: grant.userId,
      role: "user" as const,
      agentGrantId: grant.id,
    },
    grant,
    scopes,
    token: match[1],
  }
}
export type AgentIdentity = Awaited<ReturnType<typeof authenticateAgent>>

export function agentAuthResponse(error: AgentAuthorizationError) {
  const metadata = new URL(
    "/.well-known/oauth-protected-resource/api/mcp",
    agentResource
  ).href
  const challenge = [`Bearer resource_metadata="${metadata}"`]
  if (error.scopes.length)
    challenge.push(
      'error="insufficient_scope"',
      `scope="${error.scopes.join(" ")}"`
    )
  return Response.json(
    { error: error.message },
    {
      status: error.status,
      headers: {
        "WWW-Authenticate": challenge.join(", "),
        "Cache-Control": "no-store",
      },
    }
  )
}
