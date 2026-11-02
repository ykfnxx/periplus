import { afterEach, expect, it, vi } from "vitest"
import { periplusServerConfig } from "@/config/periplus.server"

afterEach(() => vi.unstubAllEnvs())

it("requires a configured authentication secret in production", () => {
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("BETTER_AUTH_SECRET", "")
  expect(() => periplusServerConfig.auth.secret).toThrow(
    "BETTER_AUTH_SECRET is required in production"
  )
})

it("uses the runtime origin when a tested image is promoted", () => {
  vi.stubEnv("NEXT_PUBLIC_PERIPLUS_APP_URL", "http://localhost:3001")
  vi.stubEnv("BETTER_AUTH_URL", "https://beta.example.test")
  expect(periplusServerConfig.app.baseUrl).toBe("https://beta.example.test")
})
