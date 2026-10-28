import { recordingResponse } from "@/modules/data/journeys/recording-http"
import { previewJourneyInvitation } from "@/modules/data/collaboration/collaboration-service"
export function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  return recordingResponse(
    async () => previewJourneyInvitation((await params).token),
    200,
    false
  )
}
