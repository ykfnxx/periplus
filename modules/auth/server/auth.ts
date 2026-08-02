import { betterAuth } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { admin } from "better-auth/plugins"
import { periplusServerConfig } from "@/config/periplus.server"
import { prisma } from "@/modules/data/db/prisma"

export const auth = betterAuth({
  baseURL: periplusServerConfig.app.baseUrl,
  trustedOrigins: periplusServerConfig.auth.trustedOrigins,
  secret: periplusServerConfig.auth.secret,
  database: prismaAdapter(prisma, {
    provider: "sqlite",
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [
    admin({
      defaultRole: "user",
      adminRoles: ["admin"],
      bannedUserMessage: "账号已停用，请联系管理员。",
    }),
  ],
})
