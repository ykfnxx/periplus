import { recordingResponse } from "@/modules/data/journeys/recording-http"
import {
  createJourneyInvitation,
  listJourneyInvitations,
} from "@/modules/data/collaboration/collaboration-service"
export function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return recordingResponse(async (context) =>
    createJourneyInvitation(context, (await params).id)
  )
}

export function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return recordingResponse(async (context) =>
    listJourneyInvitations(context, (await params).id)
  )
}
