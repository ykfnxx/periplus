import { recordingResponse } from "@/modules/data/journeys/recording-http"
import { extractReceipt } from "@/modules/data/receipts/receipt-extraction"
export function POST(request: Request) {
  return recordingResponse(async (context) =>
    extractReceipt(context, await request.json(), request.signal)
  )
}
