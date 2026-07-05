import { NextRequest, NextResponse } from "next/server"
import { AuthRequiredError, requireCurrentUser } from "@/lib/auth-context"
import {
  deleteRoute,
  getRoute,
  RouteInputError,
  updateRoute,
} from "@/lib/routes/service"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const context = await requireCurrentUser()
    const route = await getRoute(context, id)

    if (!route) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 })
    }

    return NextResponse.json(route)
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

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const context = await requireCurrentUser()
    const route = await updateRoute(context, id, body)
    if (!route) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 })
    }
    return NextResponse.json(route)
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

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const context = await requireCurrentUser()
    const deleted = await deleteRoute(context, id)
    if (!deleted) {
      return NextResponse.json({ error: "Route not found" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
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
