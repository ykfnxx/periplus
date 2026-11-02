import { NextRequest } from "next/server"
import { recordingResponse } from "@/modules/data/journeys/recording-http"
import { getJourneyWeather } from "@/modules/data/weather/weather-service"

export function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return recordingResponse(async (context) =>
    getJourneyWeather(context, (await params).id)
  )
}
