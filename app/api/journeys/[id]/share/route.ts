import { NextRequest } from "next/server"
import { recordingResponse } from "@/modules/data/journeys/recording-http"
import {
  getShareStatus,
  publishShare,
  revokeShare,
} from "@/modules/data/sharing/share-service"
import {
  shareWriteSchema,
  shareRevokeSchema,
} from "@/modules/data-model/contracts/sharing"
export const dynamic = "force-dynamic"
type Params = { params: Promise<{ id: string }> }
async function response(action: Parameters<typeof recordingResponse>[0]) {
  const result = await recordingResponse(action)
  result.headers.set("Cache-Control", "private, no-store")
  return result
}
export async function GET(_request: NextRequest, { params }: Params) {
  return response(async (context) => getShareStatus(context, (await params).id))
}
export async function PUT(request: NextRequest, { params }: Params) {
  return response(async (context) =>
    publishShare(
      context,
      (await params).id,
      shareWriteSchema.parse(await request.json())
    )
  )
}
export async function DELETE(request: NextRequest, { params }: Params) {
  return response(async (context) =>
    revokeShare(
      context,
      (await params).id,
      shareRevokeSchema.parse(await request.json())
    )
  )
}
