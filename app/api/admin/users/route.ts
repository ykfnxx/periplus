import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/modules/auth/server/context"
import {
  createAdminUser,
  listAdminUsers,
  normalizeAdminRole,
} from "@/modules/data/users/user-repository"

import { authErrorResponse } from "@/modules/auth/server/http-errors"

export async function GET() {
  try {
    await requireAdmin()
    const users = await listAdminUsers()
    return NextResponse.json(users)
  } catch (error) {
    return authErrorResponse(error)
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
    return authErrorResponse(error)
  }
}
