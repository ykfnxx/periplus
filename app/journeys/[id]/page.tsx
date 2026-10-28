import { periplusServerConfig } from "@/config/periplus.server"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/modules/auth/server/context"
import RecordingPage from "@/modules/travelogue/ui/RecordingPage"

export default async function JourneyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  const { id } = await params
  return (
    <RecordingPage
      key={id}
      journeyId={id}
      developerMode={periplusServerConfig.development.bypassLogin}
    />
  )
}
