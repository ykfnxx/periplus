// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  AuthRequiredError,
  getCurrentUser,
  PermissionDeniedError,
  requireAdmin,
  requireCurrentUser,
} from "@/modules/auth/server/context"
import { getDeveloperContext } from "@/modules/auth/server/developer-mode"
import { prisma } from "@/modules/data/db/prisma"

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/modules/auth/server/auth", () => ({
  auth: { api: { getSession } },
}))

beforeEach(() => getSession.mockReset().mockResolvedValue(null))
afterEach(() => vi.unstubAllEnvs())

describe("explicit development login bypass", () => {
  it("uses a stable real developer owner while keeping administrator APIs forbidden", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("PERIPLUS_DEVELOPER_MODE", "true")
    const first = await requireCurrentUser()
    expect(first).toEqual({ userId: "periplus-local-developer", role: "user" })
    expect(await getCurrentUser()).toEqual(first)
    expect(
      await prisma.user.findUnique({ where: { id: first.userId } })
    ).toMatchObject({
      role: "user",
      email: "developer@periplus.invalid",
    })
    await expect(requireAdmin()).rejects.toBeInstanceOf(PermissionDeniedError)
    expect(getSession).not.toHaveBeenCalled()
  })

  it("does not bypass authentication when the flag is absent or false", async () => {
    vi.stubEnv("NODE_ENV", "development")
    for (const flag of [undefined, "false", "1"]) {
      vi.stubEnv("PERIPLUS_DEVELOPER_MODE", flag)
      expect(await getDeveloperContext()).toBeNull()
      await expect(requireCurrentUser()).rejects.toBeInstanceOf(
        AuthRequiredError
      )
    }
    expect(getSession).toHaveBeenCalledTimes(3)
  })

  it("ignores the development switch in production and preserves normal session identity", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("PERIPLUS_DEVELOPER_MODE", "true")
    getSession.mockResolvedValue({
      user: { id: "signed-in-user", role: "admin" },
    })
    expect(await getDeveloperContext()).toBeNull()
    expect(await requireAdmin()).toEqual({
      userId: "signed-in-user",
      role: "admin",
    })
    getSession.mockResolvedValue(null)
    await expect(requireCurrentUser()).rejects.toBeInstanceOf(AuthRequiredError)
  })
})
