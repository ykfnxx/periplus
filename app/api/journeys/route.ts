import { NextResponse } from "next/server"
import {
  AuthRequiredError,
  requireCurrentUser,
} from "@/modules/auth/server/context"
import { listJourneys } from "@/modules/data/journeys/journey-repository"

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
