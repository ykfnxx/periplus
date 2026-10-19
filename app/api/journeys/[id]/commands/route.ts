import { NextRequest } from "next/server"
import { recordingResponse } from "@/modules/data/journeys/recording-http"
import { mutateRecordingJourney } from "@/modules/data/journeys/recording-service"

export function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return recordingResponse(async (context) =>
    mutateRecordingJourney(context, (await params).id, await request.json())
  )
}
