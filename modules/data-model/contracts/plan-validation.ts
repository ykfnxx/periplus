import { z } from "zod"
import { targetIdSchema as idSchema } from "./common"

export const PLAN_VALIDATION_ISSUE_CODES = [
  "PROJECTION_INVALID",
  "STAY_NOT_SUPPORTED",
  "PLANNED_START_MISSING",
  "TIME_ORDER_INVALID",
  "MISSING_TRANSIT_BETWEEN",
  "TRANSIT_ENDPOINT_MISMATCH",
  "TRANSIT_ROUTE_NOT_READY",
  "PLACE_UNVERIFIED",
  "IMAGE_UNAVAILABLE",
] as const

export const planValidationIssueCodeSchema = z.enum(PLAN_VALIDATION_ISSUE_CODES)

export const planValidationIssueSchema = z
  .object({
    code: planValidationIssueCodeSchema,
    localDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    eventIds: z.array(idSchema),
    severity: z.enum(["ERROR", "WARNING"]).default("ERROR"),
    path: z.string().trim().min(1).optional(),
    message: z.string().trim().min(1),
    repairability: z.enum(["AGENT", "RETRY_EXTERNAL"]),
    allowedOperations: z.array(z.string().trim().min(1)),
    suggestion: z.string().trim().min(1).optional(),
  })
  .strict()

export const planValidationReportSchema = z
  .object({
    valid: z.boolean(),
    workspaceRevision: z.number().int().nonnegative(),
    journeyRevision: z.number().int().nonnegative(),
    projectionHash: z.string().regex(/^[a-f0-9]{64}$/),
    issues: z.array(planValidationIssueSchema),
  })
  .strict()
  .superRefine((report, context) => {
    if (
      report.valid !==
      report.issues.every((issue) => issue.severity !== "ERROR")
    ) {
      context.addIssue({
        code: "custom",
        path: ["valid"],
        message: "valid must match whether error issues are empty",
      })
    }
  })

export type PlanValidationIssue = z.infer<typeof planValidationIssueSchema>
export type PlanValidationReport = z.infer<typeof planValidationReportSchema>
