import { NextRequest, NextResponse } from "next/server"
import {
  AuthRequiredError,
  PermissionDeniedError,
  requireCurrentUser,
} from "@/modules/auth/server/context"
import { AssetInUseError } from "@/modules/data/content/content-repository"
import {
  deletePhoto,
  updatePhotoCaption,
  PhotoInputError,
} from "@/modules/data/photos/photo-repository"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const caption =
    body &&
    typeof body === "object" &&
    "caption" in body &&
    typeof body.caption === "string"
      ? body.caption
      : ""

  try {
    const context = await requireCurrentUser()
    const photo = await updatePhotoCaption(context, id, caption)
    if (!photo) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 })
    }
    return NextResponse.json(photo)
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
    if (error instanceof PhotoInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const context = await requireCurrentUser()
    const result = await deletePhoto(context, id)
    if (!result.deleted) {
      return NextResponse.json({ error: "Photo not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
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
    if (error instanceof AssetInUseError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    throw error
  }
}
