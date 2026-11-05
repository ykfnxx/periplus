import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"
import { periplusPublicConfig } from "./config/periplus"

const projectRoot = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // Shared photos must be authorized on every read, never served from an
  // optimizer cache that outlives revocation. Existing images are unoptimized.
  images: { unoptimized: true },
  // OpenDAL loads a platform-specific N-API binary from its Node package.
  serverExternalPackages: ["opendal"],
  // The configured app host must also be allowed to connect its development
  // runtime. Binding to 0.0.0.0 alone does not admit LAN browser origins.
  allowedDevOrigins: [new URL(periplusPublicConfig.app.baseUrl).hostname],
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    const headers = [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ]
    return [
      { source: "/s/:path*", headers },
      { source: "/journeys/:id/share", headers },
    ]
  },
  // Uncomment for static export:
  // output: 'export',
  // distDir: 'dist',
}

export default nextConfig
