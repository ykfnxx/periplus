// @vitest-environment node
import { randomUUID } from "node:crypto"
import { afterAll, expect, it } from "vitest"
import { auth } from "@/modules/auth/server/auth"
import { setTestAuthContext } from "@/modules/auth/server/context"
import { prisma } from "@/modules/data/db/prisma"
import { issueInviteCodes } from "@/modules/auth/server/invite-codes"
import { createRecordingJourney } from "@/modules/data/journeys/recording-service"
import {
  createJourneyInvitation,
  revokeJourneyInvitation,
} from "@/modules/data/collaboration/collaboration-service"
import { POST, GET } from "@/app/api/admin/invite-codes/route"
import { DELETE } from "@/app/api/admin/invite-codes/[id]/route"

const prefix = randomUUID()
const email = () => prefix + randomUUID() + "@example.test"
const note = "registration-" + prefix
const req = (headers: Record<string, string>, address = email()) =>
  auth.handler(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        email: address,
        password: randomUUID(),
        name: "Invite check",
      }),
    })
  )
afterAll(async () => {
  setTestAuthContext(undefined)
  await prisma.user.deleteMany({
    where: { email: { startsWith: prefix }, journeys: { none: {} } },
  })
  await prisma.inviteCode.deleteMany({ where: { note } })
})
it("requires an invite on the raw endpoint and commits only successful registrations", async () => {
  expect((await req({})).status).toBe(400)
  expect(
    (await (await req({ "x-invite-code": "missing" })).json()).message
  ).toContain("不存在")
  const [invite] = await issueInviteCodes({ count: 1, maxUses: 1, note }, null)
  const normalized = {
    "x-invite-code": invite!.code.toLowerCase().replace("-", " - "),
  }
  const results = await Promise.all([req(normalized), req(normalized)])
  expect(results.map((r) => r.status).sort()).toEqual([200, 400])
  expect(
    (await results.find((r) => r.status === 400)!.json()).message
  ).toContain("用完")
  const row = await prisma.inviteCode.findUniqueOrThrow({
    where: { code: invite!.code },
    include: { redeemedBy: true },
  })
  expect(row.usedCount).toBe(1)
  expect(row.redeemedBy).toHaveLength(1)
  const [second] = await issueInviteCodes({ count: 1, maxUses: 2, note }, null)
  const header = { "x-invite-code": second!.code }
  expect((await req(header, row.redeemedBy[0]!.email)).status).toBe(422)
  expect(
    (
      await prisma.inviteCode.findUniqueOrThrow({
        where: { code: second!.code },
      })
    ).usedCount
  ).toBe(0)
  await prisma.inviteCode.update({
    where: { code: second!.code },
    data: { expiresAt: new Date(0) },
  })
  expect((await (await req(header)).json()).message).toContain("过期")
})
it("accepts an active co-writing invitation and rejects it after revocation", async () => {
  const owner = await prisma.user.create({
    data: { id: randomUUID(), email: email(), name: "Owner" },
  })
  const context = { userId: owner.id, role: "user" as const }
  const { journey } = await createRecordingJourney(context, {
    title: "Invite check",
    idempotencyKey: randomUUID(),
  })
  const invitation = await createJourneyInvitation(context, journey.id)
  const header = {
    "x-journey-invitation-token": new URL(invitation.url).pathname
      .split("/")
      .at(-1)!,
  }
  expect((await req(header)).status).toBe(200)
  await revokeJourneyInvitation(context, journey.id, invitation.invitation.id)
  expect((await (await req(header)).json()).message).toContain("共写邀请已失效")
})
it("limits issue, list and revoke to administrators", async () => {
  setTestAuthContext(null)
  expect((await GET()).status).toBe(401)
  const admin = await prisma.user.create({
    data: { id: randomUUID(), email: email(), name: "Admin", role: "admin" },
  })
  setTestAuthContext({ userId: admin.id, role: "user" })
  const create = () =>
    POST(
      new Request("http://localhost/api/admin/invite-codes", {
        method: "POST",
        body: JSON.stringify({ count: 2, maxUses: 2, note }),
      })
    )
  expect((await create()).status).toBe(403)
  setTestAuthContext({ userId: admin.id, role: "admin" })
  const issued = await create()
  expect(issued.status).toBe(201)
  const codes = await issued.json()
  expect(codes).toHaveLength(2)
  const listed = await (await GET()).json()
  const item = listed.find(
    (row: { code: string }) => row.code === codes[0].code
  )
  expect(item.remainingUses).toBe(2)
  expect(item.createdById).toBe(admin.id)
  expect(
    (
      await DELETE(new Request("http://localhost"), {
        params: Promise.resolve({ id: item.id }),
      })
    ).status
  ).toBe(204)
  expect(
    (await (await req({ "x-invite-code": item.code })).json()).message
  ).toContain("撤销")
})
