import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { admin } from "better-auth/plugins"
import { oauthProvider } from "@better-auth/oauth-provider"
import { cimd } from "@better-auth/cimd"
import { fetchClientMetadataResource } from "@better-auth/cimd/node"
import {
  agentOAuthOptions,
  agentTokenPlugin,
} from "@/modules/agent/server/oauth"
import { periplusServerConfig } from "@/config/periplus.server"
import { prisma } from "@/modules/data/db/prisma"

export const auth = betterAuth({
  baseURL: periplusServerConfig.app.baseUrl,
  secret: periplusServerConfig.auth.secret,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
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
