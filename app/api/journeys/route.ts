import { NextRequest, NextResponse } from "next/server"
import {
  AuthRequiredError,
  requireCurrentUser,
} from "@/modules/auth/server/context"
import {
  createJourney,
  JourneyInputError,
  listJourneys,
} from "@/modules/data/journeys/journey-repository"

export async function GET() {
  try {
    const context = await requireCurrentUser()
    return NextResponse.json(await listJourneys(context))
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
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  try {
    const context = await requireCurrentUser()
    const journey = await createJourney(context, body)
    return NextResponse.json(journey, { status: 201 })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }
    if (error instanceof JourneyInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    throw error
  }
}
