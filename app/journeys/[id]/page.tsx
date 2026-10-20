import { periplusServerConfig } from "@/config/periplus.server"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/modules/auth/server/context"
import { prisma } from "@/modules/data/db/prisma"
import RecordingPage from "@/modules/travelogue/ui/RecordingPage"

export default async function JourneyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  const { id } = await params
  // Admin read access does not expose another author's editing controls.
  const owned = await prisma.journey.findFirst({
    where: { id, ownerId: user.userId, deletedAt: null },
    select: { id: true },
  })
  return (
    <RecordingPage
      key={id}
      journeyId={id}
      canEdit={!!owned}
      developerMode={periplusServerConfig.development.bypassLogin}
    />
  )
}
