import { recordingResponse } from "@/modules/data/journeys/recording-http"
import { listJourneyMembers } from "@/modules/data/collaboration/collaboration-service"
export function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return recordingResponse(async (context) =>
    listJourneyMembers(context, (await params).id)
  )
}
