import { PrismaClient } from "@prisma/client"
import { loadProjectEnv } from "@/config/env.server"
import { periplusServerConfig } from "@/config/periplus.server"

loadProjectEnv()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: periplusServerConfig.database.url } },
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
