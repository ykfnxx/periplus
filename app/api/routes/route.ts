import { NextRequest, NextResponse } from "next/server"
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth-context"
import { createRoute, listRoutes, RouteInputError } from "@/lib/routes/service"

export async function GET() {
  try {
    const context = await requireCurrentUser()
    const routes = await listRoutes(context)
    return NextResponse.json(routes)
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }
    throw error
  }
}

export async function POST(request: NextRequest) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const context = await requireCurrentUser()
    const route = await createRoute(context, body)
    return NextResponse.json(route, { status: 201 })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }
    if (error instanceof RouteInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}
