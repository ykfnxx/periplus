import { recordingResponse } from "@/modules/data/journeys/recording-http"

export function GET() {
  return recordingResponse(async (context) => ({ userId: context.userId }))
}
