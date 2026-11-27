import { redirect } from "next/navigation"
import InkLanding from "@/modules/auth/ui/InkLanding"
import { getCurrentUser } from "@/modules/auth/server/context"

export default async function HomePage() {
  const currentUser = await getCurrentUser()
  if (currentUser) redirect("/journeys")

  return <InkLanding />
}
