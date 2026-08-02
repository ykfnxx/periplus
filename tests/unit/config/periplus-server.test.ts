import { afterEach, describe, expect, it } from "vitest"
import { periplusServerConfig } from "@/config/periplus.server"

const originalTrustedOrigins = process.env.PERIPLUS_AUTH_TRUSTED_ORIGINS

afterEach(() => {
  if (originalTrustedOrigins === undefined) {
    delete process.env.PERIPLUS_AUTH_TRUSTED_ORIGINS
    return
  }

  process.env.PERIPLUS_AUTH_TRUSTED_ORIGINS = originalTrustedOrigins
})

describe("periplusServerConfig.auth.trustedOrigins", () => {
  it("defaults to no additional trusted origins", () => {
    delete process.env.PERIPLUS_AUTH_TRUSTED_ORIGINS

    expect(periplusServerConfig.auth.trustedOrigins).toEqual([])
  })

  it("parses, trims, and deduplicates the configured allowlist", () => {
    process.env.PERIPLUS_AUTH_TRUSTED_ORIGINS =
      " http://localhost:3001, http://192.168.1.20:3001, http://localhost:3001, "

    expect(periplusServerConfig.auth.trustedOrigins).toEqual([
      "http://localhost:3001",
      "http://192.168.1.20:3001",
    ])
  })
})
