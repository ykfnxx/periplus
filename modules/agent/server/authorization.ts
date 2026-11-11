import { APIError } from "better-auth/api"
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider"
import { periplusServerConfig } from "@/config/periplus.server"
import { auth } from "@/modules/auth/server/auth"
import { getRecordingJourney } from "@/modules/data/journeys/recording-service"
import { prisma } from "@/modules/data/db/prisma"
import {
  AGENT_SCOPES,
  AgentAuthorizationError,
  agentAuthorizationSchema,
} from "../contracts"
import { authorizationKey } from "./grants"

export function signedOAuthQuery(
  values: Record<string, string | string[] | undefined>
) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (Array.isArray(value)) value.forEach((item) => params.append(key, item))
    else if (value !== undefined) params.append(key, value)
  }
  const names = new Set(["sig", "ba_param", ...params.getAll("ba_param")])
  return new URLSearchParams(
    [...params].filter(([key]) => names.has(key))
  ).toString()
}
export async function realSession(headers: Headers) {
  const session = await auth.api.getSession({ headers })
  if (!session || session.user.banned)
    throw new AgentAuthorizationError("请先登录")
  return session
}
export async function authorizationRequest(
  oauthQuery: string,
  headers: Headers
) {
  if (
    !(await verifyOAuthQueryParams(
      oauthQuery,
      periplusServerConfig.auth.secret
    ))
  ) {
    throw new APIError("BAD_REQUEST", {
      message: "授权请求已失效，请从客户端重新连接。",
    })
  }
  const query = new URLSearchParams(oauthQuery)
  const clientId = query.get("client_id")!
  const client = await auth.api.getOAuthClientPublic({
    headers,
    query: { client_id: clientId },
  })
  return {
    query,
    clientId,
    client,
    requestedScopes: (query.get("scope") || "").split(" "),
  }
}
export function requireApplicationOrigin(request: Request) {
  if (
    request.headers.get("origin") !==
    new URL(periplusServerConfig.app.baseUrl).origin
  ) {
    throw new AgentAuthorizationError("请求来源无效", 403)
  }
}
export async function authorizeAgent(request: Request) {
  requireApplicationOrigin(request)
  const session = await realSession(request.headers)
  const input = agentAuthorizationSchema.parse(await request.json())
  const { query, clientId, requestedScopes } = await authorizationRequest(
    input.oauthQuery,
    request.headers
  )
  if (!input.accept)
    return auth.api.oauth2Consent({
      headers: request.headers,
      body: { accept: false, oauth_query: input.oauthQuery },
    })
  if (
    !input.journeyId ||
    !input.scopes?.includes("journey:read") ||
    input.scopes.some((scope) => !requestedScopes.includes(scope))
  ) {
    throw new APIError("BAD_REQUEST", {
      message: "请选择旅程及客户端请求的权限。",
    })
  }
  await getRecordingJourney(
    { userId: session.user.id, role: "user" },
    input.journeyId
  )
  const scopes: string[] = AGENT_SCOPES.filter((scope) =>
    input.scopes!.includes(scope)
  )
  if (requestedScopes.includes("offline_access")) scopes.push("offline_access")
  const grant = await prisma.agentGrant.upsert({
    where: { authorizationKey: authorizationKey(session.user.id, query) },
    create: {
      authorizationKey: authorizationKey(session.user.id, query),
      userId: session.user.id,
      clientId,
      journeyId: input.journeyId,
      scopes,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    update: {},
  })
  if (
    grant.revokedAt ||
    grant.expiresAt <= new Date() ||
    grant.journeyId !== input.journeyId ||
    JSON.stringify(grant.scopes) !== JSON.stringify(scopes)
  ) {
    throw new AgentAuthorizationError(
      "这次授权已处理，请从客户端重新发起。",
      409
    )
  }
  return auth.api.oauth2Consent({
    headers: request.headers,
    body: {
      accept: true,
      scope: scopes.join(" "),
      oauth_query: input.oauthQuery,
    },
  })
}
