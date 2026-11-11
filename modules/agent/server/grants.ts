import { createHash } from "node:crypto"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/modules/data/db/prisma"
import type { AuthContext } from "@/modules/auth/server/context"
import { AgentAuthorizationError, type AgentScope } from "../contracts"

type Database = Prisma.TransactionClient

export function authorizationKey(userId: string, query: URLSearchParams) {
  // PKCE binds this choice to one authorization, including parallel browser tabs.
  return createHash("sha256")
    .update(
      JSON.stringify([
        userId,
        query.get("client_id"),
        query.get("redirect_uri"),
        query.get("code_challenge"),
        query.get("state"),
      ])
    )
    .digest("hex")
}

export async function requireAgentGrant(
  grantId: string,
  userId: string,
  scopes: readonly string[],
  tx: Database = prisma
) {
  const grant = await tx.agentGrant.findUnique({
    where: { id: grantId },
    include: {
      user: { select: { banned: true } },
      journey: {
        select: {
          ownerId: true,
          deletedAt: true,
          members: { where: { userId }, select: { userId: true } },
        },
      },
    },
  })
  if (
    !grant ||
    grant.userId !== userId ||
    grant.revokedAt ||
    grant.expiresAt <= new Date() ||
    grant.user.banned ||
    grant.journey.deletedAt ||
    (grant.journey.ownerId !== userId && !grant.journey.members.length)
  ) {
    throw new AgentAuthorizationError("Agent authorization is no longer active")
  }
  if (scopes.some((scope) => !grant.scopes.includes(scope))) {
    throw new AgentAuthorizationError(
      "Additional permission is required",
      403,
      scopes
    )
  }
  return grant
}

export async function checkAgentWrite(
  tx: Database,
  context: AuthContext,
  journeyId: string | undefined,
  scope: AgentScope
) {
  if (!context.agentGrantId) return
  await tx.$queryRaw`SELECT "id" FROM "AgentGrant" WHERE "id" = ${context.agentGrantId} FOR UPDATE`
  const grant = await requireAgentGrant(
    context.agentGrantId,
    context.userId,
    [scope],
    tx
  )
  if (journeyId !== undefined && journeyId !== grant.journeyId) {
    throw new AgentAuthorizationError(
      "Journey is outside this authorization",
      403
    )
  }
}
