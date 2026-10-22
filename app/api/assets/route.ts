import { NextRequest, NextResponse } from "next/server"
import { AssetInputError } from "@/modules/data/assets/asset-contract"
import { resourceResponse } from "@/modules/data/assets/asset-http"
import { listAssetRecords } from "@/modules/data/assets/asset-repository"
import { assetDto, uploadResource } from "@/modules/data/assets/asset-service"

export const runtime = "nodejs"
export function GET() {
  return resourceResponse(async (context) =>
    NextResponse.json(
      (await listAssetRecords(context)).map((asset) => assetDto(context, asset))
    )
  )
}
export function POST(request: NextRequest) {
  return resourceResponse(async (context) => {
    if (!request.body) throw new AssetInputError("A resource body is required")
    let originalName: string | undefined
    try {
      originalName = request.headers.has("x-file-name")
        ? decodeURIComponent(request.headers.get("x-file-name")!)
        : undefined
    } catch {
      throw new AssetInputError("Resource filename must be URL-encoded")
    }
    const result = await uploadResource(
      context,
      {
        source: request.body,
        uploadId: request.headers.get("x-upload-id") ?? "",
        mimeType:
          request.headers.get("content-type") ?? "application/octet-stream",
        originalName,
        sizeBytes: request.headers.has("content-length")
          ? Number(request.headers.get("content-length"))
          : undefined,
      },
      request.signal
    )
    return NextResponse.json(assetDto(context, result.asset), {
      status: result.created ? 201 : 200,
    })
  })
}
