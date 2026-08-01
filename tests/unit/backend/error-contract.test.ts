import type { IncomingMessage, ServerResponse } from "node:http"
import { Readable } from "node:stream"
import { describe, expect, it, vi } from "vitest"
import { z } from "zod"
import type { AgentGateway } from "@/backend/agent/gateway"
import { domainErrorResponse } from "@/backend/domain-error"
import { errorResponse, handleInternalRequest } from "@/backend/internal-api"
import { errorEvent, parseWireMessage } from "@/backend/ws"
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

describe("Agent HTTP and WebSocket domain error contract", () => {
  const cases: ReadonlyArray<{
    error: unknown
    status: 400 | 403 | 409 | 500
    code: string
    message?: string
    issues?: unknown
  }> = [
    {
      error: new JourneyGraphValidationError("raw graph", ["issue-a"]),
      status: 400,
      code: "invalid_graph",
      issues: ["issue-a"],
    },
    {
      error: z.object({ value: z.string() }).safeParse({ value: 1 }).error!,
      status: 400,
      code: "invalid_input",
      issues: expect.any(Array),
    },
    {
      error: new WorkspaceInputError("correct the command"),
      status: 400,
      code: "invalid_input",
    },
    {
      error: new JourneyInputError("correct the Journey commit"),
      status: 400,
      code: "invalid_input",
    },
    {
      error: new PermissionDeniedError("not allowed"),
      status: 403,
      code: "permission_denied",
    },
    {
      error: new WorkspaceRevisionConflictError(),
      status: 409,
      code: "revision_conflict",
    },
    {
      error: new JourneyRevisionConflictError(),
      status: 409,
      code: "revision_conflict",
    },
    {
      error: new WorkspaceIdempotencyConflictError(),
      status: 409,
      code: "idempotency_conflict",
    },
    {
      error: new JourneyIdempotencyConflictError(),
      status: 409,
      code: "idempotency_conflict",
    },
    {
      error: new Error("database password must not escape"),
      status: 500,
      code: "internal_error",
      message: "Unexpected internal error",
    },
  ]

  it.each(cases)("maps $code consistently", (entry) => {
    expect(domainErrorResponse(entry.error)).toMatchObject({
      status: entry.status,
      code: entry.code,
      ...(entry.message ? { message: entry.message } : {}),
      ...(entry.issues ? { issues: entry.issues } : {}),
    })
    expect(errorResponse(entry.error)).toMatchObject({
      status: entry.status,
      body: {
        error: {
          code: entry.code,
          ...(entry.message ? { message: entry.message } : {}),
          ...(entry.issues ? { issues: entry.issues } : {}),
        },
      },
    })
    expect(errorEvent(entry.error, "command-1")).toMatchObject({
      type: "error",
      payload: {
        code: entry.code,
        commandId: "command-1",
        ...(entry.message ? { message: entry.message } : {}),
        ...(entry.issues ? { issues: entry.issues } : {}),
      },
    })
  })

  it("maps malformed Agent HTTP JSON and unsupported WebSocket envelopes to stable invalid_input", async () => {
    const request = Readable.from(["{"]) as IncomingMessage
    request.method = "POST"
    request.url = "/internal/agent-tool"
    let status: number | undefined
    let responseBody = ""
    const response = {
      writeHead(value: number) {
        status = value
        return this
      },
      end(value?: string) {
        responseBody = value ?? ""
        return this
      },
    } as unknown as ServerResponse
    const executeTool = vi.fn()
    await handleInternalRequest(request, response, {
      executeTool,
    } as unknown as AgentGateway)
    expect(status).toBe(400)
    expect(JSON.parse(responseBody)).toEqual({
      error: {
        code: "invalid_input",
        message: "Request body must be valid JSON",
      },
    })
    expect(executeTool).not.toHaveBeenCalled()

    for (const raw of ["{", JSON.stringify({ type: "unsupported" })]) {
      let error: unknown
      try {
        parseWireMessage(raw)
      } catch (caught) {
        error = caught
      }
      expect(errorEvent(error)).toMatchObject({
        type: "error",
        payload: { code: "invalid_input" },
      })
    }
  })
})
