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

export type EvalMetricResult = z.infer<typeof evalMetricResultSchema>
export type EvalCapabilityReport = z.infer<typeof evalCapabilityReportSchema>

export function capabilityReport(
  pack: string,
  caseId: string,
  metrics: EvalMetricResult[]
): EvalCapabilityReport {
  return evalCapabilityReportSchema.parse({
    pack,
    caseId,
    hardPass: !metrics.some(
      (metric) => metric.hard && metric.status === "FAIL"
    ),
    metrics,
  })
}
