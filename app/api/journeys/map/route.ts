import { recordingResponse } from "@/modules/data/journeys/recording-http"
import { getRecordingAtlas } from "@/modules/data/journeys/recording-service"

export function GET() {
  return recordingResponse(getRecordingAtlas)
}
