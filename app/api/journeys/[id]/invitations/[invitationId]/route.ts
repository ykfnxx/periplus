import { recordingResponse } from "@/modules/data/journeys/recording-http"
import { revokeJourneyInvitation } from "@/modules/data/collaboration/collaboration-service"
export function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; invitationId: string }> }
) {
  return recordingResponse(async (context) =>
    revokeJourneyInvitation(
      context,
      (await params).id,
      (await params).invitationId
    )
  )
}
