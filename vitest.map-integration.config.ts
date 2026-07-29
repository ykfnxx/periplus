import path from "node:path"
import { fileURLToPath } from "node:url"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import react from "@vitejs/plugin-react"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [
    react(),
    storybookTest({
      configDir: path.join(dirname, ".storybook"),
      storybookScript: "npm run storybook",
      tags: {
        include: ["map-integration"],
        exclude: [],
        skip: [],
      },
    }),
  ],
  test: {
    name: "map-integration",
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({}),
      instances: [{ browser: "chromium" }],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./"),
    },
  },
  optimizeDeps: {
    include: ["@amap/amap-jsapi-loader"],
  },
})
