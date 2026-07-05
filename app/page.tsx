import MapWorkspace from "@/components/workbench/MapWorkspace"
import LandingGate from "@/components/auth/LandingGate"
import { getCurrentUser } from "@/lib/auth-context"

export default async function HomePage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) return <LandingGate />

  return <MapWorkspace />
}
