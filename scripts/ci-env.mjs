import { randomBytes } from "node:crypto"
import { writeFileSync } from "node:fs"

// Disposable CI/build configuration. Deployment supplies its own runtime env.
writeFileSync(
  ".env.local",
  Object.entries({
    DATABASE_URL:
      "postgresql://periplus:periplus@127.0.0.1:5432/periplus?schema=public&connection_limit=5",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: "http://127.0.0.1:3001",
    NEXT_PUBLIC_PERIPLUS_APP_URL: "http://localhost:3001",
    NEXT_PUBLIC_PERIPLUS_SHOW_MOCK_ACCOUNTS: "false",
    NEXT_PUBLIC_AMAP_KEY: process.env.NEXT_PUBLIC_AMAP_KEY ?? "",
    PERIPLUS_DEVELOPER_MODE: "false",
    PERIPLUS_STORAGE_SCHEME: "fs",
    PERIPLUS_STORAGE_ROOT: "./uploads",
  })
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n",
  { mode: 0o600 }
)
