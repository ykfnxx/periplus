import path from "node:path"
import { fileURLToPath } from "node:url"
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin"
import react from "@vitejs/plugin-react"
import { playwright } from "@vitest/browser-playwright"
import { defineConfig } from "vitest/config"

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
          exclude: [
            "node_modules",
            "tests/e2e",
            ".worktrees",
            "**/.worktrees/**",
          ],
        },
      },
      {
        extends: true,
        plugins: [
          storybookTest({
            configDir: path.join(dirname, ".storybook"),
            storybookScript: "npm run storybook",
            tags: {
              include: ["test"],
              exclude: ["map-integration"],
              skip: [],
            },
          }),
        ],
        test: {
          name: "storybook",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./"),
    },
  },
  optimizeDeps: {
    include: [
      "@amap/amap-jsapi-loader",
      "react-markdown",
      "remark-gfm",
    ],
  },
})
