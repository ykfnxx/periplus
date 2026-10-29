import { z } from "zod"
import {
  targetDateTimeSchema as dateTimeSchema,
  targetIdSchema as idSchema,
} from "./common"
import {
  TARGET_COORDINATE_SYSTEMS,
  TARGET_GEOMETRY_KINDS,
  TARGET_TRANSIT_SEGMENT_MODES,
  TARGET_TRAFFIC_BASES,
  TARGET_TRANSIT_RUN_STATUSES,
} from "./enums"

const targetTransitTrafficSectionSchema = z.object({
  status: z.enum(["UNKNOWN", "FREE_FLOW", "SLOW", "CONGESTED", "SEVERE"]),
  positions: z.array(z.tuple([z.number(), z.number()])),
})

export const targetTransitSegmentSchema = z
  .object({
    id: idSchema,
    order: z.number().int().nonnegative(),
    mode: z.enum(TARGET_TRANSIT_SEGMENT_MODES),
    fromName: z.string().optional(),
    toName: z.string().optional(),
    lineName: z.string().optional(),
    distanceMeters: z.number().nonnegative().optional(),
    durationSeconds: z.number().int().nonnegative().optional(),
    fareAmount: z.number().nonnegative().optional(),
    departAt: dateTimeSchema.optional(),
    arriveAt: dateTimeSchema.optional(),
    coordinateSystem: z.enum(TARGET_COORDINATE_SYSTEMS),
    geometryKind: z.enum(TARGET_GEOMETRY_KINDS),
    positions: z.array(z.tuple([z.number(), z.number()])),
    trafficSections: z.array(targetTransitTrafficSectionSchema).optional(),
  })
  .superRefine((segment, context) => {
    if (
      segment.departAt &&
      segment.arriveAt &&
      segment.arriveAt < segment.departAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["arriveAt"],
        message: "segment arrival cannot precede departure",
      })
    }
  })

const transitPlanFieldsSchema = z.object({
  id: idSchema,
  planningRunId: idSchema,
  transitEventId: idSchema,
  provider: z.string().trim().min(1),
  rank: z.number().int().nonnegative(),
  label: z.string().trim().min(1),
  strategy: z.string().trim().min(1),
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  fareAmount: z.number().nonnegative().optional(),
  trafficBasis: z.enum(TARGET_TRAFFIC_BASES),
  calculatedAt: dateTimeSchema,
  validUntil: dateTimeSchema.optional(),
  segments: z.array(targetTransitSegmentSchema),
})

export const targetTransitPlanSchema = transitPlanFieldsSchema.superRefine(
  (plan, context) => {
    if (plan.validUntil && plan.validUntil < plan.calculatedAt) {
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "plan validity cannot precede calculation",
      })
    }
  }
)

export const targetTransitPlanningRunSchema = z
  .object({
    id: idSchema,
    transitEventId: idSchema,
    requestFingerprint: z.string().trim().min(1),
    provider: z.string().trim().min(1),
    status: z.enum(TARGET_TRANSIT_RUN_STATUSES),
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
    warning: z.string().optional(),
    calculatedAt: dateTimeSchema,
    validUntil: dateTimeSchema.optional(),
    plans: z.array(targetTransitPlanSchema),
  })
  .superRefine((run, context) => {
    if (new Set(run.plans.map((plan) => plan.id)).size !== run.plans.length) {
      context.addIssue({
        code: "custom",
        path: ["plans"],
        message: "plan ids must be unique within a planning run",
      })
    }
    if (new Set(run.plans.map((plan) => plan.rank)).size !== run.plans.length) {
      context.addIssue({
        code: "custom",
        path: ["plans"],
        message: "plan rank must be unique within a planning run",
      })
    }
    const segments = run.plans.flatMap((plan) => plan.segments)
    if (
      new Set(segments.map((segment) => segment.id)).size !== segments.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["plans"],
        message: "segment ids must be unique within a planning run",
      })
    }
    if (run.status === "FAILED" && run.plans.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["plans"],
        message: "FAILED planning run cannot contain plans",
      })
    }
    if (run.status === "FAILED" && !run.errorCode && !run.errorMessage) {
      context.addIssue({
        code: "custom",
        path: ["errorCode"],
        message: "FAILED planning run requires an error",
      })
    }
    if (run.validUntil && run.validUntil < run.calculatedAt) {
      context.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "run validity cannot precede calculation",
      })
    }
    if (run.status === "READY" && run.plans.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["plans"],
        message: "READY planning run requires at least one plan",
      })
    }
    for (const plan of run.plans) {
      if (
        plan.planningRunId !== run.id ||
        plan.transitEventId !== run.transitEventId
      ) {
        context.addIssue({
          code: "custom",
          path: ["plans"],
          message: `plan ${plan.id} must belong to its run and transit event`,
        })
      }
      if (
        new Set(plan.segments.map((segment) => segment.order)).size !==
        plan.segments.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["plans"],
          message: `plan ${plan.id} segment order must be unique`,
        })
      }
      if (
        new Set(plan.segments.map((segment) => segment.id)).size !==
        plan.segments.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["plans"],
          message: `plan ${plan.id} segment ids must be unique`,
        })
      }
    }
  })

export type TargetTransitPlanningRun = z.infer<
  typeof targetTransitPlanningRunSchema
>
export const transitRouteSchema = z
  .object({
    requestFingerprint: z.string().min(1),
    // Exactly the selected plan; provider candidate lists stay run-local.
    plans: z
      .array(
        transitPlanFieldsSchema
          .omit({ planningRunId: true, transitEventId: true })
          .extend({ requestFingerprint: z.string().min(1) })
          .superRefine((plan, context) => {
            if (plan.validUntil && plan.validUntil < plan.calculatedAt)
              context.addIssue({
                code: "custom",
                path: ["validUntil"],
                message: "plan validity cannot precede calculation",
              })
          })
      )
      .length(1),
    warning: z.string().optional(),
  })
  .strict()
