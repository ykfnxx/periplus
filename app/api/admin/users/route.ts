import { NextRequest, NextResponse } from "next/server"
import {
  AuthRequiredError,
  PermissionDeniedError,
  requireAdmin,
} from "@/lib/auth-context"
import {
  createAdminUser,
  adminUserSelect,
  normalizeAdminRole,
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

export async function GET() {
  try {
    await requireAdmin()
    const users = await prisma.user.findMany({
      select: adminUserSelect(),
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json(users)
  } catch (error) {
    const response = authErrorResponse(error)
    if (response) return response
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin()
    const body = await request.json()
    if (
      !body ||
      typeof body !== "object" ||
      typeof body.email !== "string" ||
      typeof body.name !== "string" ||
      typeof body.password !== "string"
    ) {
      return NextResponse.json({ error: "Invalid user input" }, { status: 400 })
    }

    const user = await createAdminUser({
      email: body.email,
      name: body.name,
      password: body.password,
      role: normalizeAdminRole(body.role),
    })
    return NextResponse.json(user, { status: 201 })
  } catch (error) {
    const response = authErrorResponse(error)
    if (response) return response
    throw error
  }
}
