import { redirect } from "next/navigation"
import LandingGate from "@/modules/auth/ui/LandingGate"
import { getCurrentUser } from "@/modules/auth/server/context"

export default async function HomePage() {
  const currentUser = await getCurrentUser()
  if (currentUser) redirect("/workspace")

  return <LandingGate />
}
