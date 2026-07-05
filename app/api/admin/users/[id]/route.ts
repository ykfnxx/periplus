import { NextRequest, NextResponse } from "next/server"
import {
  AuthRequiredError,
  PermissionDeniedError,
  requireAdmin,
} from "@/lib/auth-context"
import {
  adminUserSelect,
  normalizeAdminRole,
  setCredentialPassword,
} from "@/lib/admin/users"
import { prisma } from "@/lib/prisma"

function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    )
  }
  if (error instanceof PermissionDeniedError) {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }
  return null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await requireAdmin()
    const body = await request.json()
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid user input" }, { status: 400 })
    }

    const data: {
      name?: string
      role?: string
      banned?: boolean
      banReason?: string | null
      banExpires?: Date | null
    } = {}

    if ("name" in body && typeof body.name === "string") data.name = body.name
    if ("role" in body) data.role = normalizeAdminRole(body.role)
    if ("banned" in body && typeof body.banned === "boolean") {
      data.banned = body.banned
      data.banReason = body.banned ? "Disabled by admin" : null
      data.banExpires = null
    }

    const user = await prisma.user.update({
      where: { id },
      data,
      select: adminUserSelect(),
    })

    if ("password" in body && typeof body.password === "string") {
      await setCredentialPassword(id, body.password)
    }

    return NextResponse.json(user)
  } catch (error) {
    const response = authErrorResponse(error)
    if (response) return response
    throw error
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    await requireAdmin()
    const user = await prisma.user.update({
      where: { id },
      data: {
        banned: true,
        banReason: "Disabled by admin",
        banExpires: null,
      },
      select: adminUserSelect(),
    })
    return NextResponse.json(user)
  } catch (error) {
    const response = authErrorResponse(error)
    if (response) return response
    throw error
  }
}
