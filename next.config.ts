import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"
import { periplusPublicConfig } from "./config/periplus"

const projectRoot = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // OpenDAL loads a platform-specific N-API binary from its Node package.
  serverExternalPackages: ["opendal"],
  // The configured app host must also be allowed to connect its development
  // runtime. Binding to 0.0.0.0 alone does not admit LAN browser origins.
  allowedDevOrigins: [new URL(periplusPublicConfig.app.baseUrl).hostname],
  turbopack: {
    root: projectRoot,
  },
  // Uncomment for static export:
  // output: 'export',
  // distDir: 'dist',
}

export default nextConfig
