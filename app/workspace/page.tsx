import { redirect } from "next/navigation"
import MapWorkspace from "@/modules/workspace/ui/MapWorkspace"
import { getCurrentUser } from "@/modules/auth/server/context"

export default async function WorkspacePage() {
  const currentUser = await getCurrentUser()
  if (!currentUser) redirect("/")

  return <MapWorkspace />
}
