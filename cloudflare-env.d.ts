import type { R2Bucket } from "@cloudflare/workers-types"
declare global {
  interface CloudflareEnv {
    HYPERDRIVE: { connectionString: string }
    ASSETS_BUCKET: R2Bucket
  }
}
