import { readFile } from "node:fs/promises"
import { NextRequest, NextResponse } from "next/server"
import {
  AuthRequiredError,
  PermissionDeniedError,
  requireCurrentUser,
} from "@/modules/auth/server/context"
import { getPhotoFile } from "@/modules/data/photos/photo-repository"
import {
  privatePhotoExtension,
  privatePhotoFilePath,
} from "@/modules/data/photos/photo-storage"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const context = await requireCurrentUser()
    const photo = await getPhotoFile(context, id)
    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 })
    }
    if (!privatePhotoExtension(photo.mimeType)) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 })
    }

    let bytes: Buffer
    try {
      bytes = await readFile(privatePhotoFilePath(photo.storageKey))
    } catch {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Length": String(bytes.byteLength),
        "Content-Type": photo.mimeType,
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }
    if (error instanceof PermissionDeniedError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }
}
