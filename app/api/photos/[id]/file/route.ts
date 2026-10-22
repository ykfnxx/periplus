import { NextRequest } from "next/server"
import { resourceFile } from "@/modules/data/assets/asset-http"

export const runtime = "nodejs"
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return resourceFile(request, (await params).id, "IMAGE")
}
