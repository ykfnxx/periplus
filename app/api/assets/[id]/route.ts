import { NextRequest, NextResponse } from "next/server"
import { resourceResponse } from "@/modules/data/assets/asset-http"
import { removeResource } from "@/modules/data/assets/asset-service"

export function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return resourceResponse(async (context) => {
    const deleted = await removeResource(context, (await params).id)
    return NextResponse.json(
      deleted ? { success: true } : { error: "Resource not found" },
      { status: deleted ? 200 : 404 }
    )
  })
}
