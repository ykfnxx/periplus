import { AsyncLocalStorage } from "node:async_hooks"
import { createHash } from "node:crypto"
import { APIError, type BetterAuthOptions } from "better-auth"
import { prismaAdapter } from "better-auth/adapters/prisma"
import { createAuthMiddleware } from "better-auth/api"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/modules/data/db/prisma"
import { normalizeInviteCode } from "../model/invite-code"

const transaction = new AsyncLocalStorage<Prisma.TransactionClient>()

// Better Auth starts the signup transaction before creating the user. Give its
// adapter and the invitation hook the same client so any later failure rolls back both.
export function invitationDatabase(options: BetterAuthOptions) {
  const adapter = prismaAdapter(prisma, {
    provider: "postgresql",
    transaction: true,
  })(options)
  const run: typeof adapter.transaction = (work) =>
    prisma.$transaction((tx) =>
      transaction.run(tx, () =>
        work(prismaAdapter(tx, { provider: "postgresql" })(options))
      )
    )
  return { ...adapter, transaction: run }
}

export const requireRegistrationInvite = createAuthMiddleware(async (ctx) => {
  if (
    ctx.path === "/sign-up/email" &&
    !ctx.headers?.get("x-journey-invitation-token") &&
    !normalizeInviteCode(ctx.headers?.get("x-invite-code") ?? "")
  ) {
    throw new APIError("BAD_REQUEST", { message: "请填写邀请码。" })
  }
})

export async function authorizeRegistration(headers?: Headers) {
  const tx = transaction.getStore()
  if (!tx)
    throw new Error("Registration requires an active database transaction")
  const token = headers?.get("x-journey-invitation-token")
  if (token) {
    const tokenHash = createHash("sha256").update(token).digest("hex")
    const invitation = await tx.$queryRaw<{ id: string }[]>`
      SELECT i.id FROM "JourneyInvitation" i JOIN "Journey" j ON j.id = i."journeyId"
      WHERE i."tokenHash" = ${tokenHash} AND i."revokedAt" IS NULL
        AND i."expiresAt" > clock_timestamp() AND j."deletedAt" IS NULL
      FOR SHARE OF i, j`
    if (!invitation.length)
      throw new APIError("BAD_REQUEST", {
        message: "共写邀请已失效，请联系旅程作者。",
      })
    return null
  }
  const code = normalizeInviteCode(headers?.get("x-invite-code") ?? "")
  if (!code) throw new APIError("BAD_REQUEST", { message: "请填写邀请码。" })
  const redeemed = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "InviteCode" SET "usedCount" = "usedCount" + 1
    WHERE code = ${code} AND "revokedAt" IS NULL AND "usedCount" < "maxUses"
      AND ("expiresAt" IS NULL OR "expiresAt" > clock_timestamp()) RETURNING id`
  if (redeemed[0]) return redeemed[0].id
  const invite = await tx.inviteCode.findUnique({ where: { code } })
  let message = "邀请码不存在，请核对后重试。"
  if (invite)
    message =
      invite.revokedAt || (invite.expiresAt && invite.expiresAt <= new Date())
        ? "邀请码已过期或已撤销，请向邀请人索取新码。"
        : "邀请码已用完，请向邀请人索取新码。"
  throw new APIError("BAD_REQUEST", { message })
}
