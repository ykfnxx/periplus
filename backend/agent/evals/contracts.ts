import { z } from "zod"

export const EVAL_TRACE_SCHEMA_VERSION = 1 as const

export const EVAL_TRACE_EVENT_TYPES = [
  "run.started",
  "run.completed",
  "run.failed",
  "turn.started",
  "turn.completed",
  "turn.failed",
  "model.requested",
  "model.completed",
  "model.failed",
  "tool.started",
  "tool.completed",
  "tool.failed",
  "command.dispatched",
  "command.applied",
  "command.rejected",
  "state.diff.recorded",
  "evidence.recorded",
  "validator.completed",
  "budget.exceeded",
] as const

export const evalTraceEventTypeSchema = z.enum(EVAL_TRACE_EVENT_TYPES)
export const evalTraceEventStatusSchema = z.enum(["OK", "ERROR", "SKIPPED"])

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)

const commandIdentityEventTypes = new Set([
  "command.dispatched",
  "command.applied",
  "command.rejected",
  "state.diff.recorded",
])

const commandRevisionAfterEventTypes = new Set([
  "command.applied",
  "state.diff.recorded",
])
const successfulEventTypes = new Set([
  "run.started",
  "run.completed",
  "turn.started",
  "turn.completed",
  "model.requested",
  "model.completed",
  "tool.started",
  "tool.completed",
  "command.dispatched",
  "command.applied",
  "state.diff.recorded",
  "evidence.recorded",
])
const failedEventTypes = new Set([
  "run.failed",
  "turn.failed",
  "model.failed",
  "tool.failed",
  "command.rejected",
  "budget.exceeded",
])

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  )
}

function isNullableStringArray(value: unknown): value is Array<string | null> {
  return (
    Array.isArray(value) &&
    value.every((entry) => entry === null || typeof entry === "string")
  )
}

export const evalTraceEventSchema = z
  .object({
    schemaVersion: z.literal(EVAL_TRACE_SCHEMA_VERSION),
    runId: z.string().trim().min(1),
    scenarioId: z.string().trim().min(1),
    seq: z.number().int().positive(),
    timestamp: z.iso.datetime(),
    type: evalTraceEventTypeSchema,
    turnId: z.string().trim().min(1).optional(),
    spanId: z.string().trim().min(1),
    parentSpanId: z.string().trim().min(1).optional(),
    workspaceId: z.string().trim().min(1).optional(),
    journeyId: z.string().trim().min(1).optional(),
    commandId: z.string().trim().min(1).optional(),
    revisionBefore: z.number().int().nonnegative().optional(),
    revisionAfter: z.number().int().nonnegative().optional(),
    durationMs: z.number().nonnegative().optional(),
    status: evalTraceEventStatusSchema,
    payload: z.record(z.string(), z.unknown()),
    prevEventHash: hashSchema.optional(),
    eventHash: hashSchema,
  })
  .strict()
  .superRefine((event, context) => {
    if (successfulEventTypes.has(event.type) && event.status !== "OK") {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: `${event.type} requires OK status`,
      })
    }
    if (failedEventTypes.has(event.type) && event.status !== "ERROR") {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: `${event.type} requires ERROR status`,
      })
    }
    if (commandIdentityEventTypes.has(event.type)) {
      if (!event.commandId) {
        context.addIssue({
          code: "custom",
          path: ["commandId"],
          message: `${event.type} requires commandId`,
        })
      }
      if (event.revisionBefore == null) {
        context.addIssue({
          code: "custom",
          path: ["revisionBefore"],
          message: `${event.type} requires revisionBefore`,
        })
      }
    }
    if (
      commandRevisionAfterEventTypes.has(event.type) &&
      event.revisionAfter == null
    ) {
      context.addIssue({
        code: "custom",
        path: ["revisionAfter"],
        message: `${event.type} requires revisionAfter`,
      })
    }
    if (
      (event.type === "command.dispatched" ||
        event.type === "command.rejected") &&
      event.revisionAfter != null
    ) {
      context.addIssue({
        code: "custom",
        path: ["revisionAfter"],
        message: `${event.type} cannot claim revisionAfter`,
      })
    }
    if (
      (event.type === "command.applied" ||
        event.type === "state.diff.recorded") &&
      event.revisionBefore != null &&
      event.revisionAfter != null &&
      event.revisionAfter < event.revisionBefore
    ) {
      context.addIssue({
        code: "custom",
        path: ["revisionAfter"],
        message: `${event.type} cannot move the revision backwards`,
      })
    }
    if (event.type.startsWith("tool.")) {
      if (
        typeof event.payload.toolType !== "string" ||
        event.payload.toolType.trim().length === 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["payload", "toolType"],
          message: `${event.type} requires payload.toolType`,
        })
      }
    }
    if (event.type === "command.dispatched") {
      if (!isNonEmptyString(event.payload.commandName)) {
        context.addIssue({
          code: "custom",
          path: ["payload", "commandName"],
          message: "command.dispatched requires payload.commandName",
        })
      }
      if (!isNonEmptyString(event.payload.idempotencyKey)) {
        context.addIssue({
          code: "custom",
          path: ["payload", "idempotencyKey"],
          message: "command.dispatched requires payload.idempotencyKey",
        })
      }
      if (
        typeof event.payload.commandHash !== "string" ||
        !/^[a-f0-9]{64}$/.test(event.payload.commandHash)
      ) {
        context.addIssue({
          code: "custom",
          path: ["payload", "commandHash"],
          message: "command.dispatched requires a SHA-256 payload.commandHash",
        })
      }
    }
    if (event.type === "command.applied") {
      if (!isNonEmptyString(event.payload.commandName)) {
        context.addIssue({
          code: "custom",
          path: ["payload", "commandName"],
          message: "command.applied requires payload.commandName",
        })
      }
    }
    if (event.type === "command.rejected") {
      for (const field of [
        "commandName",
        "errorName",
        "errorMessage",
      ] as const) {
        if (!isNonEmptyString(event.payload[field])) {
          context.addIssue({
            code: "custom",
            path: ["payload", field],
            message: `command.rejected requires payload.${field}`,
          })
        }
      }
    }
    if (event.type === "state.diff.recorded") {
      if (!isStringArray(event.payload.changedEventIds)) {
        context.addIssue({
          code: "custom",
          path: ["payload", "changedEventIds"],
          message: "state.diff.recorded requires payload.changedEventIds",
        })
      }
      if (!isNullableStringArray(event.payload.projectionInvalidationScopes)) {
        context.addIssue({
          code: "custom",
          path: ["payload", "projectionInvalidationScopes"],
          message:
            "state.diff.recorded requires payload.projectionInvalidationScopes",
        })
      }
    }
    if (event.type === "evidence.recorded") {
      if (
        typeof event.payload.evidenceId !== "string" ||
        event.payload.evidenceId.trim().length === 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["payload", "evidenceId"],
          message: "evidence.recorded requires payload.evidenceId",
        })
      }
      if (
        typeof event.payload.toolType !== "string" ||
        event.payload.toolType.trim().length === 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["payload", "toolType"],
          message: "evidence.recorded requires payload.toolType",
        })
      }
      if (
        typeof event.payload.contentHash !== "string" ||
        !/^[a-f0-9]{64}$/.test(event.payload.contentHash)
      ) {
        context.addIssue({
          code: "custom",
          path: ["payload", "contentHash"],
          message: "evidence.recorded requires a SHA-256 payload.contentHash",
        })
      }
    }
  })

export type EvalTraceEvent = z.infer<typeof evalTraceEventSchema>
export type EvalTraceEventType = z.infer<typeof evalTraceEventTypeSchema>
export type EvalTraceEventStatus = z.infer<typeof evalTraceEventStatusSchema>

export type EvalTraceInput = Omit<
  EvalTraceEvent,
  "schemaVersion" | "seq" | "timestamp" | "prevEventHash" | "eventHash"
> & {
  timestamp?: string
}

export const evalMetricResultSchema = z
  .object({
    id: z.string().trim().min(1),
    status: z.enum(["PASS", "FAIL", "SKIPPED"]),
    hard: z.boolean(),
    value: z.union([z.string(), z.number(), z.boolean()]).optional(),
    expected: z.union([z.string(), z.number(), z.boolean()]).optional(),
    message: z.string().trim().min(1),
  })
  .strict()

export const evalCapabilityReportSchema = z
  .object({
    pack: z.string().trim().min(1),
    caseId: z.string().trim().min(1),
    hardPass: z.boolean(),
    metrics: z.array(evalMetricResultSchema),
  })
  .strict()
  .superRefine((report, context) => {
    const hardMetrics = report.metrics.filter((metric) => metric.hard)
    const expectedHardPass =
      hardMetrics.length > 0 &&
      hardMetrics.every((metric) => metric.status === "PASS")
    if (report.hardPass !== expectedHardPass) {
      context.addIssue({
        code: "custom",
        path: ["hardPass"],
        message:
          "hardPass must be true only when at least one hard metric exists and every hard metric passes",
      })
    }
  })

export type EvalMetricResult = z.infer<typeof evalMetricResultSchema>
export type EvalCapabilityReport = z.infer<typeof evalCapabilityReportSchema>

export function capabilityReport(
  pack: string,
  caseId: string,
  metrics: EvalMetricResult[]
): EvalCapabilityReport {
  const hardMetrics = metrics.filter((metric) => metric.hard)
  return evalCapabilityReportSchema.parse({
    pack,
    caseId,
    hardPass:
      hardMetrics.length > 0 &&
      hardMetrics.every((metric) => metric.status === "PASS"),
    metrics,
  })
}
