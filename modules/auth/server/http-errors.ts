import { NextResponse } from "next/server"
import { AuthRequiredError, PermissionDeniedError } from "./context"
export function authErrorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    )
  }
  if (error instanceof PermissionDeniedError) {
    return NextResponse.json({ error: error.message }, { status: 403 })
  }
  throw error
}
