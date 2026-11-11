import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
} from "better-auth/api"
import {
  getOAuthProviderApi,
  getOAuthProviderState,
  type OAuthOptions,
} from "@better-auth/oauth-provider"
import { z } from "zod"
import { periplusServerConfig } from "@/config/periplus.server"
import { prisma } from "@/modules/data/db/prisma"
import { AGENT_SCOPES, AgentAuthorizationError } from "../contracts"
import { authorizationKey, requireAgentGrant } from "./grants"

export const agentResource = new URL(
  "/api/mcp",
  periplusServerConfig.app.baseUrl
).href
export const agentIssuer = new URL(
  "/api/auth",
  periplusServerConfig.app.baseUrl
).href
export const oauthScopes = [...AGENT_SCOPES, "offline_access"]

async function flowGrant(userId: string) {
  const state = await getOAuthProviderState()
  if (!state?.query)
    throw new APIError("BAD_REQUEST", { error: "invalid_request" })
  const query = new URLSearchParams(state.query)
  return prisma.agentGrant.findUnique({
    where: { authorizationKey: authorizationKey(userId, query) },
  })
}

async function oauthGrant(
  userId: string | undefined,
  grantId: string | undefined,
  scopes: readonly string[]
) {
  if (!userId || !grantId)
    throw new APIError("UNAUTHORIZED", { error: "invalid_grant" })
  try {
    return await requireAgentGrant(grantId, userId, scopes)
  } catch (error) {
    if (!(error instanceof AgentAuthorizationError)) throw error
    throw new APIError("UNAUTHORIZED", {
      error: "invalid_grant",
      error_description: error.message,
    })
  }
}

export const agentOAuthOptions = {
  loginPage: "/agent/login",
  consentPage: "/agent/authorize",
  disableJwtPlugin: true,
  scopes: oauthScopes,
  grantTypes: ["authorization_code", "refresh_token"],
  accessTokenExpiresIn: 15 * 60,
  refreshTokenExpiresIn: 30 * 24 * 60 * 60,
  resources: [{ identifier: agentResource, allowedScopes: oauthScopes }],
  clientRegistrationDefaultResources: [agentResource],
  clientRegistrationDefaultScopes: oauthScopes,
  clientPrivileges: async ({ user }) => user?.role === "admin",
  resourcePrivileges: async ({ user }) => user?.role === "admin",
  postLogin: {
    page: "/agent/authorize",
    shouldRedirect: async ({ user }) => !(await flowGrant(user.id)),
    consentReferenceId: async ({ user, scopes }) => {
      const grant = await flowGrant(user.id)
      if (!grant)
        throw new APIError("BAD_REQUEST", { error: "consent_required" })
      await oauthGrant(user.id, grant.id, scopes)
      return grant.id
    },
  },
  customTokenResponseFields: async ({
    grantType,
    user,
    scopes,
    verificationValue,
  }) => {
    if (grantType === "authorization_code")
      await oauthGrant(user?.id, verificationValue?.referenceId, scopes)
    return {}
  },
  customAccessTokenClaims: async ({ user, referenceId, scopes }) => {
    const grant = await oauthGrant(user?.id, referenceId, scopes)
    return { grant_id: grant.id }
  },
} satisfies OAuthOptions<string[]>

// Verification stays inside the provider's request context; this endpoint is server-only.
export const agentTokenPlugin = {
  id: "periplus-agent-token",
  hooks: {
    before: [
      {
        matcher: (ctx: { path?: string }) => ctx.path === "/oauth2/token",
        handler: createAuthMiddleware(async (ctx) => {
          if (
            ctx.body?.grant_type !== "refresh_token" ||
            typeof ctx.body.refresh_token !== "string"
          )
            return
          const provider = getOAuthProviderApi(ctx, agentOAuthOptions)
          const token = await provider.hashToken(
            ctx.body.refresh_token,
            "refresh_token"
          )
          const refresh = await prisma.oauthRefreshToken.findUnique({
            where: { token },
          })
          // Opaque-token issuance does not invoke customAccessTokenClaims.
          if (refresh)
            await oauthGrant(
              refresh.userId,
              refresh.referenceId ?? undefined,
              refresh.scopes
            )
        }),
      },
    ],
  },
  endpoints: {
    verifyAgentAccessToken: createAuthEndpoint.serverOnly(
      {
        method: "POST",
        body: z.object({ token: z.string().min(1) }),
      },
      async (ctx) =>
        ctx.json(
          await getOAuthProviderApi(
            ctx,
            agentOAuthOptions
          ).requireActiveAccessToken(ctx.body.token)
        )
    ),
  },
}
