import { NextResponse } from "next/server"
import { z } from "zod"
import {
  AuthRequiredError,
  PermissionDeniedError,
  requireCurrentUser,
  type AuthContext,
} from "@/modules/auth/server/context"
import {
  JourneyInputError,
  JourneyIdempotencyConflictError,
  JourneyRevisionConflictError,
} from "./journey-repository"
import { ReceiptOcrError } from "@/modules/data/receipts/receipt-extraction"
import {
  AssetInputError,
  AssetStorageError,
} from "@/modules/data/assets/asset-contract"
import { RecordingNotFoundError } from "./recording-service"

export async function recordingResponse(
  action: (context: AuthContext) => Promise<unknown>,
  status = 200,
  authenticated = true
) {
  try {
    return NextResponse.json(
      await action(
        authenticated
          ? await requireCurrentUser()
          : { userId: "", role: "user" }
      ),
      {
        status,
      }
    )
  } catch (error) {
    if (error instanceof AuthRequiredError)
      return NextResponse.json(
        { error: error.message, code: "FORBIDDEN" },
        { status: 401 }
      )
    if (error instanceof PermissionDeniedError)
      return NextResponse.json(
        { error: error.message, code: "FORBIDDEN" },
        { status: 403 }
      )
    if (error instanceof ReceiptOcrError || error instanceof AssetStorageError)
      return NextResponse.json(
        {
          error: error.message,
          code:
            error instanceof ReceiptOcrError
              ? error.code
              : "STORAGE_UNAVAILABLE",
        },
        { status: 503 }
      )
    if (error instanceof RecordingNotFoundError)
      return NextResponse.json(
        { error: error.message, code: "NOT_FOUND" },
        { status: 404 }
      )
    if (error instanceof JourneyRevisionConflictError)
      return NextResponse.json(
        { error: error.message, code: "REVISION_CONFLICT" },
        { status: 409 }
      )
    if (error instanceof JourneyIdempotencyConflictError)
      return NextResponse.json(
        { error: error.message, code: "IDEMPOTENCY_CONFLICT" },
        { status: 409 }
      )
    if (
      error instanceof z.ZodError ||
      error instanceof SyntaxError ||
      error instanceof JourneyInputError ||
      error instanceof AssetInputError
    ) {
      const message =
        error instanceof z.ZodError
          ? error.issues
              .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
              .join("; ")
          : error instanceof SyntaxError
            ? "Invalid JSON"
            : error.message
      return NextResponse.json(
        { error: message, code: "INVALID_INPUT" },
        { status: 400 }
      )
    }
    throw error
  }
}
