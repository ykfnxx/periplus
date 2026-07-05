import { defineConfig } from "prisma/config"
import { loadProjectEnv } from "./config/env.server"
import { periplusServerConfig } from "./config/periplus.server"

loadProjectEnv()

export default defineConfig({
  schema: "prisma/schema.prisma",
  engine: "classic",
  datasource: {
    url: periplusServerConfig.database.url,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
})
