// @vitest-environment node
import { randomUUID } from "node:crypto"
import { afterAll, expect, it } from "vitest"
import { auth } from "@/modules/auth/server/auth"
import { prisma } from "@/modules/data/db/prisma"

const email = `pg-auth-${randomUUID()}@example.test`
afterAll(async () => {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return
  await prisma.session.deleteMany({ where: { userId: user.id } })
  await prisma.account.deleteMany({ where: { userId: user.id } })
  await prisma.user.delete({ where: { id: user.id } })
})

it("persists password authentication and sessions through the PostgreSQL adapter", async () => {
  const password = `resource-auth-${randomUUID()}`
  const signup = await auth.api.signUpEmail({
    body: { email, password, name: "Postgres Auth" },
  })
  expect(signup.user.email).toBe(email)
  const signin = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  })
  expect(signin.status).toBe(200)
  const cookie = signin.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ")
  const session = await auth.api.getSession({
    headers: new Headers({ cookie }),
  })
  expect(session?.user.id).toBe(signup.user.id)
  expect(
    await prisma.session.count({ where: { userId: signup.user.id } })
  ).toBeGreaterThan(0)
  expect(
    await prisma.account.count({
      where: { userId: signup.user.id, providerId: "credential" },
    })
  ).toBe(1)
  await prisma.user.update({
    where: { id: signup.user.id },
    data: { banned: true },
  })
  const blocked = await auth.api.signInEmail({
    body: { email, password },
    asResponse: true,
  })
  expect(blocked.status).toBe(403)
})
