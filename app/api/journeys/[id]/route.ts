import { NextRequest, NextResponse } from "next/server"
import {
  AuthRequiredError,
  requireCurrentUser,
} from "@/modules/auth/server/context"
import { getJourney } from "@/modules/data/journeys/journey-repository"

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
