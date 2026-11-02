// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest"
import { GET } from "@/app/api/health/route"
import { prisma } from "@/modules/data/db/prisma"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

it("reports the running image and checks the real database", async () => {
  vi.stubEnv("PERIPLUS_RELEASE_SHA", "verified-image")
  const response = await GET()
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({
    status: "ready",
    version: "verified-image",
  })
})

it("returns unavailable without exposing a database error or credentials", async () => {
  vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(
    new Error("postgresql://private:secret@internal/db")
  )
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  const response = await GET()
  expect(response.status).toBe(503)
  expect(await response.json()).toEqual({ status: "unavailable" })
  expect(log).toHaveBeenCalledWith("Readiness database check failed")
})
