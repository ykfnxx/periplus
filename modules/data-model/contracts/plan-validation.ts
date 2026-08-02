import { z } from "zod"
import { targetIdSchema as idSchema } from "./common"

export const PLAN_VALIDATION_ISSUE_CODES = [
  "PROJECTION_INVALID",
  "ROOT_EVENT_TYPE_INVALID",
  "ROOT_ROUTE_DISCONNECTED",
  "CITY_TIMEZONE_INVALID",
  "CITY_ROUTE_EMPTY",
  "CITY_EVENT_TYPE_INVALID",
  "STAY_NOT_SUPPORTED",
  "PLANNED_START_MISSING",
  "MISSING_TRANSIT_BETWEEN",
  "TRANSIT_ENDPOINT_MISMATCH",
  "TRANSIT_ROUTE_NOT_READY",
] as const

export const planValidationIssueCodeSchema = z.enum(PLAN_VALIDATION_ISSUE_CODES)

export const planValidationIssueSchema = z
  .object({
    code: planValidationIssueCodeSchema,
    cityEventId: idSchema.optional(),
    localDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    eventIds: z.array(idSchema),
    message: z.string().trim().min(1),
    repairability: z.enum(["AGENT", "RETRY_EXTERNAL"]),
    allowedOperations: z.array(z.string().trim().min(1)),
  })
  .strict()

export const planValidationReportSchema = z
  .object({
    valid: z.boolean(),
    workspaceRevision: z.number().int().nonnegative(),
    journeyRevision: z.number().int().positive(),
    projectionHash: z.string().regex(/^[a-f0-9]{64}$/),
    issues: z.array(planValidationIssueSchema),
  })
  .strict()
  .superRefine((report, context) => {
    if (report.valid !== (report.issues.length === 0)) {
      context.addIssue({
        code: "custom",
        path: ["valid"],
        message: "valid must match whether issues is empty",
      })
    }
  })

export type PlanValidationIssue = z.infer<typeof planValidationIssueSchema>
export type PlanValidationReport = z.infer<typeof planValidationReportSchema>
