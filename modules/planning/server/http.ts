import { after, NextResponse } from "next/server"
import { z } from "zod"
import {
  AuthRequiredError,
  PermissionDeniedError,
  requireCurrentUser,
  type AuthContext,
} from "@/modules/auth/server/context"
import { JourneyInputError } from "@/modules/data/journeys/journey-repository"
import { PlanningError } from "./errors"
import type { PlanningRuntime } from "./runtime-contract"
import type { PlanningStarted } from "../contracts"
import { executePlanningRun } from "./service"
export async function planningResponse(
  action: (context: AuthContext) => Promise<unknown>,
  status = 200
) {
  try {
    return NextResponse.json(await action(await requireCurrentUser()), {
      status,
    })
  } catch (error) {
    if (error instanceof PlanningError)
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      )
    if (
      error instanceof AuthRequiredError ||
      error instanceof PermissionDeniedError
    )
      return NextResponse.json(
        { error: error.message, code: "FORBIDDEN" },
        { status: error instanceof AuthRequiredError ? 401 : 403 }
      )
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof JourneyInputError
    )
      return NextResponse.json(
        { error: "Invalid planning input", code: "INVALID_INPUT" },
        { status: 422 }
      )
    throw error
  }
}
export function schedulePlanningRun(
  context: AuthContext,
  journeyId: string,
  started: PlanningStarted,
  runtime: PlanningRuntime
) {
  // Next's lifecycle keeps the server task alive after returning 202.
  after(() =>
    executePlanningRun(
      context,
      journeyId,
      started.proposalId,
      started.runId,
      runtime
    )
  )
}
