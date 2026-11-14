import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/modules/auth/server/context"
import { getRecordingJourney } from "@/modules/data/journeys/recording-service"
import { prisma } from "@/modules/data/db/prisma"
import { agentResource } from "@/modules/agent/server/oauth"
import GrantList from "@/modules/agent/react/GrantListController"
export default async function AgentGrantsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const context = await getCurrentUser()
  if (!context) redirect("/")
  const { id } = await params
  const journey = await getRecordingJourney(context, id)
  const grants = await prisma.agentGrant.findMany({
    where: {
      journeyId: id,
      ...(journey.ownerId === context.userId ? {} : { userId: context.userId }),
    },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  })
  const clients = await prisma.oauthClient.findMany({
    where: { clientId: { in: grants.map((grant) => grant.clientId) } },
    select: { clientId: true, name: true },
  })
  const names = new Map(clients.map((client) => [client.clientId, client.name]))
  return (
    <main className="journal-workbench min-h-dvh bg-cream px-5 py-10 text-ink">
      <section className="mx-auto max-w-xl space-y-7">
        <Link
          className="text-sm text-russet underline underline-offset-4"
          href={`/journeys/${encodeURIComponent(id)}`}
        >
          返回旅程
        </Link>
        <h1 className="text-xl font-semibold">Agent 接入</h1>
        <GrantList
          key={`${context.userId}:${id}`}
          journeyId={id}
          resource={agentResource}
          grants={grants.map((grant) => ({
            id: grant.id,
            clientName: names.get(grant.clientId) || grant.clientId,
            userName: grant.user.name,
            scopes: grant.scopes,
            expiresAt: grant.expiresAt.toISOString(),
            revokedAt: grant.revokedAt?.toISOString() ?? null,
            lastUsedAt: grant.lastUsedAt?.toISOString() ?? null,
          }))}
        />
      </section>
    </main>
  )
}
