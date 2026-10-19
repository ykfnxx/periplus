import { periplusServerConfig } from "@/config/periplus.server"
import { prisma } from "@/modules/data/db/prisma"
import type { AuthContext } from "./context"

const developerId = "periplus-local-developer"

export async function getDeveloperContext(): Promise<AuthContext | null> {
  if (!periplusServerConfig.development.bypassLogin) return null

  // Use one real, non-admin owner for the isolated development database. All
  // pages, commands and private files still enforce their usual ownership.
  await prisma.user.upsert({
    where: { id: developerId },
    create: {
      id: developerId,
      name: "开发者",
      email: "developer@periplus.invalid",
      emailVerified: true,
      role: "user",
    },
    update: {},
  })
  return { userId: developerId, role: "user" }
}
