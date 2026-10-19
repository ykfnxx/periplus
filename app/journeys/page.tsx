import { redirect } from "next/navigation"
import { getCurrentUser } from "@/modules/auth/server/context"
import JourneyLibraryPage from "@/modules/travelogue/ui/JourneyLibraryPage"

export default async function JourneysPage() {
  if (!(await getCurrentUser())) redirect("/")
  return <JourneyLibraryPage />
}
