import { NextRequest } from "next/server"
import { recordingResponse } from "@/modules/data/journeys/recording-http"
import { getSharePreview } from "@/modules/data/sharing/share-service"
import { z } from "zod"
export const dynamic = "force-dynamic"
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const response = await recordingResponse(async (context) => {
    const value = z
      .enum(["true", "false"])
      .parse(request.nextUrl.searchParams.get("includeCosts") ?? "false")
    return getSharePreview(context, (await params).id, value === "true")
  })
  response.headers.set("Cache-Control", "private, no-store")
  return response
}
