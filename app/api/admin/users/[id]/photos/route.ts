import { NextResponse } from "next/server"
import {
  AuthRequiredError,
  PermissionDeniedError,
  requireAdmin,
} from "@/modules/auth/server/context"
import { listPhotosForOwner } from "@/modules/data/photos/photo-repository"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const context = await requireAdmin()
    return NextResponse.json(await listPhotosForOwner(context, id))
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
