import { createHash, randomBytes } from "node:crypto"
import { periplusServerConfig } from "@/config/periplus.server"
import {
  isAdmin,
  PermissionDeniedError,
  type AuthContext,
} from "@/modules/auth/server/context"
import { prisma } from "@/modules/data/db/prisma"
import { RecordingNotFoundError } from "@/modules/data/journeys/recording-service"
import { journeyReadScope } from "@/modules/data/journeys/recording-access"

const userSelect = { id: true, name: true, image: true } as const
const contributor = (user: {
  id: string
  name: string
  image: string | null
}) => ({ userId: user.id, name: user.name, image: user.image })
const hash = (token: string) => createHash("sha256").update(token).digest("hex")

async function managedJourney(context: AuthContext, id: string) {
  const journey = await prisma.journey.findFirst({
    where: { id, deletedAt: null, ...journeyReadScope(context) },
  })
  if (!journey) throw new RecordingNotFoundError()
  if (!isAdmin(context) && journey.ownerId !== context.userId)
    throw new PermissionDeniedError(
      "Only the journey author can manage invitations"
    )
  return journey
}
export async function listJourneyMembers(context: AuthContext, id: string) {
  const journey = await prisma.journey.findFirst({
    where: { id, deletedAt: null, ...journeyReadScope(context) },
    include: {
      owner: { select: userSelect },
      members: {
        include: { user: { select: userSelect } },
        orderBy: [{ joinedAt: "asc" }, { userId: "asc" }],
      },
    },
  })
  if (!journey) throw new RecordingNotFoundError()
  return {
    members: [
      {
        user: contributor(journey.owner),
        role: "OWNER" as const,
        joinedAt: journey.createdAt.toISOString(),
      },
      ...journey.members
        .filter((member) => member.userId !== journey.ownerId)
        .map((member) => ({
          user: contributor(member.user),
          role: "MEMBER" as const,
          joinedAt: member.joinedAt.toISOString(),
        })),
    ],
  }
}
export async function createJourneyInvitation(
  context: AuthContext,
  id: string
) {
  await managedJourney(context, id)
  const token = randomBytes(32).toString("base64url")
  const invitation = await prisma.journeyInvitation.create({
    data: {
      journeyId: id,
      createdById: context.userId,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  })
  return {
    invitation: {
      id: invitation.id,
      expiresAt: invitation.expiresAt.toISOString(),
      revokedAt: null,
    },
    url: `${periplusServerConfig.app.baseUrl.replace(/\/$/, "")}/join/${token}`,
  }
}
export async function revokeJourneyInvitation(
  context: AuthContext,
  id: string,
  invitationId: string
) {
  await managedJourney(context, id)
  const result = await prisma.journeyInvitation.updateMany({
    where: { id: invitationId, journeyId: id },
    data: { revokedAt: new Date() },
  })
  if (!result.count) throw new RecordingNotFoundError()
  return { success: true }
}
export async function previewJourneyInvitation(token: string) {
  const invitation = await prisma.journeyInvitation.findFirst({
    where: {
      tokenHash: hash(token),
      revokedAt: null,
      expiresAt: { gt: new Date() },
      journey: { deletedAt: null },
    },
    include: { journey: { include: { owner: { select: userSelect } } } },
  })
  if (!invitation) throw new RecordingNotFoundError()
  return {
    journeyId: invitation.journeyId,
    journeyTitle: invitation.journey.title,
    owner: contributor(invitation.journey.owner),
    expiresAt: invitation.expiresAt.toISOString(),
  }
}
export async function acceptJourneyInvitation(
  context: AuthContext,
  token: string
) {
  return prisma.$transaction(async (tx) => {
    // Revoke and accept use the same invitation row, so an accepted response
    // cannot race past a completed revocation.
    const rows = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT "id" FROM "JourneyInvitation" WHERE "tokenHash" = ${hash(token)} FOR UPDATE`
    const invitation = rows[0]
      ? await tx.journeyInvitation.findUnique({
          where: { id: rows[0].id },
          include: { journey: true },
        })
      : null
    if (
      !invitation ||
      invitation.revokedAt ||
      invitation.expiresAt <= new Date() ||
      invitation.journey.deletedAt
    )
      throw new RecordingNotFoundError()
    if (invitation.journey.ownerId !== context.userId) {
      await tx.journeyMember.upsert({
        where: {
          journeyId_userId: {
            journeyId: invitation.journeyId,
            userId: context.userId,
          },
        },
        create: { journeyId: invitation.journeyId, userId: context.userId },
        update: {},
      })
    }
    return { journeyId: invitation.journeyId }
  })
}

export async function listJourneyInvitations(context: AuthContext, id: string) {
  await managedJourney(context, id)
  const invitations = await prisma.journeyInvitation.findMany({
    where: { journeyId: id },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: { id: true, expiresAt: true, revokedAt: true },
  })
  return {
    invitations: invitations.map((invitation) => ({
      id: invitation.id,
      expiresAt: invitation.expiresAt.toISOString(),
      revokedAt: invitation.revokedAt?.toISOString() ?? null,
    })),
  }
}
