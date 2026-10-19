import { NextRequest } from "next/server"
import { recordingResponse } from "@/modules/data/journeys/recording-http"
import { getRecordingJourney } from "@/modules/data/journeys/recording-service"

export function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return recordingResponse(async (context) =>
    getRecordingJourney(context, (await params).id)
  )
}
