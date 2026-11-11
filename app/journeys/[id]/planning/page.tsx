import { redirect } from "next/navigation"
import { getCurrentUser } from "@/modules/auth/server/context"
import { getRecordingJourney } from "@/modules/data/journeys/recording-service"
import PlanningPage from "@/modules/planning/ui/PlanningPage"

export default async function JourneyPlanningPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const context = await getCurrentUser()
  if (!context) redirect("/")
  const { id } = await params
  const journey = await getRecordingJourney(context, id)
  return (
    <PlanningPage
      key={id}
      journey={{
        id: journey.id,
        title: journey.title,
        eventCount: journey.events.length,
      }}
    />
  )
}
