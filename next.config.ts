import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import type { NextConfig } from "next"

const projectRoot = dirname(fileURLToPath(import.meta.url))
const allowedDevOrigins = process.env.PERIPLUS_DEV_ALLOWED_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

const nextConfig: NextConfig = {
  allowedDevOrigins,
  turbopack: {
    root: projectRoot,
  },
  // Uncomment for static export:
  // output: 'export',
  // distDir: 'dist',
}

export default nextConfig
