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

export const transitRouteSchema = z
  .object({
    requestFingerprint: z.string().min(1),
    // Exactly the selected plan; candidate lists are not stored in the Journey.
    plans: z
      .array(
        transitPlanFieldsSchema
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
