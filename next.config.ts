import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const projectRoot = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  // Uncomment for static export:
  // output: 'export',
  // distDir: 'dist',
}

export default nextConfig
