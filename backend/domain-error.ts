import { ZodError } from "zod"
import { PermissionDeniedError } from "@/modules/auth/server/context"
import { JourneyGraphValidationError } from "@/modules/data/journeys/journey-graph-validator"
import {
  JourneyIdempotencyConflictError,
  JourneyInputError,
  JourneyRevisionConflictError,
} from "@/modules/data/journeys/journey-repository"
import {
  WorkspaceIdempotencyConflictError,
  WorkspaceInputError,
  WorkspaceRevisionConflictError,
} from "@/modules/data/workspaces/workspace-repository"

export interface DomainErrorResponse {
  status: 400 | 403 | 409 | 500
  code:
    | "invalid_input"
    | "invalid_graph"
    | "permission_denied"
    | "revision_conflict"
    | "idempotency_conflict"
    | "internal_error"
  message: string
  issues?: readonly string[]
}

export function domainErrorResponse(error: unknown): DomainErrorResponse {
  if (error instanceof JourneyGraphValidationError) {
    return {
      status: 400,
      code: "invalid_graph",
      message: "Journey graph violates domain invariants",
      issues: error.issues,
    }
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      code: "invalid_input",
      message: "Command input is invalid",
      issues: error.issues.map(
        (issue) =>
          `${issue.path.length ? issue.path.join(".") : "input"}: ${issue.message}`
      ),
    }
  }
  if (error instanceof WorkspaceInputError) {
    return { status: 400, code: "invalid_input", message: error.message }
  }
  if (error instanceof JourneyInputError) {
    return { status: 400, code: "invalid_input", message: error.message }
  }
  if (error instanceof PermissionDeniedError) {
    return { status: 403, code: "permission_denied", message: error.message }
  }
  if (
    error instanceof WorkspaceRevisionConflictError ||
    error instanceof JourneyRevisionConflictError
  ) {
    return { status: 409, code: "revision_conflict", message: error.message }
  }
  if (
    error instanceof WorkspaceIdempotencyConflictError ||
    error instanceof JourneyIdempotencyConflictError
  ) {
    return {
      status: 409,
      code: "idempotency_conflict",
      message: error.message,
    }
  }
  return {
    status: 500,
    code: "internal_error",
    message: "Unexpected internal error",
  }
}
