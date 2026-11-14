import path from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          setupFiles: ["./tests/ui/setup.ts"],
          include: ["tests/ui/**/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "application",
          environment: "node",
          include: ["tests/application/**/*.test.ts"],
        },
      },
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
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./"),
    },
  },
})
