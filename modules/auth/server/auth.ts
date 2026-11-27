import { betterAuth } from "better-auth"
import {
  invitationDatabase,
  authorizeRegistration,
  requireRegistrationInvite,
} from "./registration"
import { admin } from "better-auth/plugins"
import { oauthProvider } from "@better-auth/oauth-provider"
import { cimd } from "@better-auth/cimd"
import { fetchClientMetadataResource } from "@better-auth/cimd/node"
import {
  agentOAuthOptions,
  agentTokenPlugin,
} from "@/modules/agent/server/oauth"
import { periplusServerConfig } from "@/config/periplus.server"

export const auth = betterAuth({
  baseURL: periplusServerConfig.app.baseUrl,
  secret: periplusServerConfig.auth.secret,
  database: invitationDatabase,
  user: {
    additionalFields: {
      invitedByCodeId: {
        type: "string",
        required: false,
        input: false,
        returned: false,
      },
    },
  },
  hooks: { before: requireRegistrationInvite },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          if (ctx?.path === "/sign-up/email") {
            const invitedByCodeId = await authorizeRegistration(ctx.headers)
            return { data: { ...user, invitedByCodeId } }
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    oauthProvider(agentOAuthOptions),
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
    agentTokenPlugin,
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      bannedUserMessage: "账号已停用，请联系管理员。",
    }),
  ],
})
