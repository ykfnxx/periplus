import { periplusServerConfig } from "@/config/periplus.server"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/modules/auth/server/context"
import JourneyLibraryPage from "@/modules/travelogue/react/JourneyLibraryScreen"

export default async function JourneysPage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")
  return (
    <JourneyLibraryPage
      key={user.userId}
      userId={user.userId}
      developerMode={periplusServerConfig.development.bypassLogin}
    />
  )
}
