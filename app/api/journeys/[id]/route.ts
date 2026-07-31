import { NextRequest, NextResponse } from "next/server"
import {
  AuthRequiredError,
  requireCurrentUser,
} from "@/modules/auth/server/context"
import {
  deleteJourney,
  getJourney,
  JourneyInputError,
  JourneyRevisionConflictError,
  updateJourney,
} from "@/modules/data/journeys/journey-repository"

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const context = await requireCurrentUser()
    const journey = await getJourney(context, id)
    if (!journey) {
      return NextResponse.json({ error: "Journey not found" }, { status: 404 })
    }
    return NextResponse.json(journey)
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
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const ifMatch = request.headers.get("if-match")
  if (!ifMatch) {
    return NextResponse.json(
      { error: "If-Match revision is required" },
      { status: 428 }
    )
  }
  const expectedRevision = Number(ifMatch)
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
    return NextResponse.json(
      { error: "If-Match must be an integer revision" },
      { status: 400 }
    )
  }
  try {
    const context = await requireCurrentUser()
    const journey = await updateJourney(context, id, body, expectedRevision)
    if (!journey) {
      return NextResponse.json({ error: "Journey not found" }, { status: 404 })
    }
    return NextResponse.json(journey)
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }
    if (error instanceof JourneyRevisionConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    if (error instanceof JourneyInputError) {
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
    const deleted = await deleteJourney(context, id)
    if (!deleted) {
      return NextResponse.json({ error: "Journey not found" }, { status: 404 })
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
