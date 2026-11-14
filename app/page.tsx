import { redirect } from "next/navigation"
import LandingGate from "@/modules/auth/react/LandingGateController"
import { getCurrentUser } from "@/modules/auth/server/context"

export default async function HomePage() {
  const currentUser = await getCurrentUser()
  if (currentUser) redirect("/journeys")

  return <LandingGate />
}
