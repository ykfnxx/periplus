import { NextRequest } from "next/server"
import { recordingResponse } from "@/modules/data/journeys/recording-http"
import {
  createRecordingJourney,
  listRecordingJourneys,
} from "@/modules/data/journeys/recording-service"

export function GET() {
  return recordingResponse(listRecordingJourneys)
}

export function POST(request: NextRequest) {
  return recordingResponse(
    async (context) => createRecordingJourney(context, await request.json()),
    201
  )
}
