import { readFileSync, writeFileSync } from "node:fs"

// Only the asset build ID belongs in the bundle. Deployment supplies private
// configuration through bindings rather than the dotenv files OpenNext embeds.
const buildId = readFileSync(".next/BUILD_ID", "utf8").trim()
writeFileSync(
  ".open-next/cloudflare/next-env.mjs",
  `export const production = ${JSON.stringify({ PERIPLUS_BUILD_ID: buildId })}\n`
)
