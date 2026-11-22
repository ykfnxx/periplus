import { defineConfig } from "prisma/config"
import { loadProjectEnv } from "./config/env.server"
import { periplusServerConfig } from "./config/periplus.server"

loadProjectEnv()

export default defineConfig({
  schema: "prisma/schema.prisma",
  engine: "classic",
  datasource: {
    url: periplusServerConfig.database.url,
    directUrl: periplusServerConfig.database.directUrl,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
})
