import { recordingResponse } from "@/modules/data/journeys/recording-http"
import { acceptJourneyInvitation } from "@/modules/data/collaboration/collaboration-service"
export function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  return recordingResponse(async (context) =>
    acceptJourneyInvitation(context, (await params).token)
  )
}
