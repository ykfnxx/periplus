import { redirect } from "next/navigation"
import { getCurrentUser } from "@/modules/auth/server/context"
import RecordingPage from "@/modules/travelogue/ui/RecordingPage"

export default async function JourneyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  if (!(await getCurrentUser())) redirect("/")
  const { id } = await params
  return <RecordingPage journeyId={id} />
}
