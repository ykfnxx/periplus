import { NextRequest, NextResponse } from "next/server"
import { resourceResponse } from "@/modules/data/assets/asset-http"
import { deletePhoto } from "@/modules/data/photos/photo-repository"

export function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return resourceResponse(async (context) => {
    const result = await deletePhoto(context, (await params).id)
    return NextResponse.json(
      result.deleted ? { success: true } : { error: "Photo not found" },
      { status: result.deleted ? 200 : 404 }
    )
  })
}
