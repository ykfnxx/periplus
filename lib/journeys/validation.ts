import { z } from "zod"
import { validateJourneyGraph } from "./graph"
import { deriveSectionTimes } from "./sections"
import {
  JOURNEY_EVENT_EXECUTION_STATUSES,
  JOURNEY_EVENT_LINK_KINDS,
  JOURNEY_EVENT_ORIGINS,
  JOURNEY_SECTION_KINDS,
  JOURNEY_STATUSES,
  TRANSIT_GEOMETRY_KINDS,
  TRANSIT_PREFERENCES,
  TRANSIT_REQUEST_MODES,
  TRANSIT_SEGMENT_MODES,
  TRANSIT_TRAFFIC_BASES,
  TRANSPORT_MODES,
  type JourneyInput,
} from "@/types/journey"

const optionalId = z.string().trim().min(1).optional()
const optionalDateTime = z.iso.datetime().optional()

const eventBase = {
  id: z.string().trim().min(1),
  journeyId: optionalId,
  parentEventId: optionalId,
  replacedByEventId: optionalId,
  origin: z.enum(JOURNEY_EVENT_ORIGINS),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  plannedStartAt: optionalDateTime,
  plannedEndAt: optionalDateTime,
  actualStartAt: optionalDateTime,
  actualEndAt: optionalDateTime,
  createdAt: optionalDateTime,
  updatedAt: optionalDateTime,
}

const locationDetail = z.object({
  plannedPlaceId: optionalId,
  actualPlaceId: optionalId,
  plannedLat: z.number().min(-90).max(90),
  plannedLng: z.number().min(-180).max(180),
  actualLat: z.number().min(-90).max(90).optional(),
  actualLng: z.number().min(-180).max(180).optional(),
  coordinateSystem: z.string().trim().min(1).optional(),
  coordinateProvider: z.string().trim().min(1).optional(),
  providerPlaceId: z.string().trim().min(1).optional(),
  plannedDurationMinutes: z.number().int().nonnegative().optional(),
  actualDurationMinutes: z.number().int().nonnegative().optional(),
})

const executable = {
  executionStatus: z.enum(JOURNEY_EVENT_EXECUTION_STATUSES),
}

const journeyLngLat = z.tuple([
  z.number().min(-180).max(180),
  z.number().min(-90).max(90),
])

const transitPlanSchema = z.object({
  id: z.string().trim().min(1),
  provider: z.enum(["amap", "mock"]),
  rank: z.number().int().nonnegative(),
  label: z.string().trim().min(1),
  strategy: z.string().trim().min(1),
  distanceMeters: z.number().nonnegative(),
  durationSeconds: z.number().nonnegative(),
  fareAmount: z.number().nonnegative().optional(),
  trafficBasis: z.enum(TRANSIT_TRAFFIC_BASES),
  calculatedAt: z.iso.datetime(),
  validUntil: optionalDateTime,
  requestFingerprint: z.string().trim().min(1),
  segments: z.array(
    z.object({
      id: z.string().trim().min(1),
      order: z.number().int().nonnegative(),
      mode: z.enum(TRANSIT_SEGMENT_MODES),
      fromName: z.string().optional(),
      toName: z.string().optional(),
      lineName: z.string().optional(),
      distanceMeters: z.number().nonnegative().optional(),
      durationSeconds: z.number().nonnegative().optional(),
      fareAmount: z.number().nonnegative().optional(),
      departAt: optionalDateTime,
      arriveAt: optionalDateTime,
      coordinateSystem: z.literal("GCJ02"),
      geometryKind: z.enum(TRANSIT_GEOMETRY_KINDS),
      positions: z.array(journeyLngLat),
      trafficSections: z
        .array(
          z.object({
            status: z.enum([
              "UNKNOWN",
              "FREE_FLOW",
              "SLOW",
              "CONGESTED",
              "SEVERE",
            ]),
            positions: z.array(journeyLngLat),
          })
        )
        .optional(),
    })
  ),
})

const eventSchema = z.discriminatedUnion("type", [
  z.object({
    ...eventBase,
    type: z.literal("SECTION"),
    detail: z.object({
      kind: z.enum(JOURNEY_SECTION_KINDS),
      placeId: optionalId,
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      coordinateSystem: z.string().trim().min(1).optional(),
      coordinateProvider: z.string().trim().min(1).optional(),
      providerPlaceId: z.string().trim().min(1).optional(),
    }),
  }),
  z.object({
    ...eventBase,
    ...executable,
    type: z.literal("VISIT"),
    detail: locationDetail,
  }),
  z.object({
    ...eventBase,
    ...executable,
    type: z.literal("STAY"),
    detail: locationDetail.extend({ checkInNote: z.string().optional() }),
  }),
  z.object({
    ...eventBase,
    ...executable,
    type: z.literal("MEAL"),
    detail: locationDetail.extend({ cuisine: z.string().optional() }),
  }),
  z.object({
    ...eventBase,
    ...executable,
    type: z.literal("ACTIVITY"),
    detail: locationDetail.extend({ bookingReference: z.string().optional() }),
  }),
  z.object({
    ...eventBase,
    ...executable,
    type: z.literal("TRANSIT"),
    detail: z.object({
      plannedFromEventId: optionalId,
      plannedToEventId: optionalId,
      actualFromEventId: optionalId,
      actualToEventId: optionalId,
      transportMode: z.enum(TRANSPORT_MODES),
      requestMode: z.enum(TRANSIT_REQUEST_MODES).optional(),
      preference: z.enum(TRANSIT_PREFERENCES).optional(),
      plannedDepartAt: optionalDateTime,
      actualDepartAt: optionalDateTime,
      plannedDurationMinutes: z.number().int().nonnegative().optional(),
      actualDurationMinutes: z.number().int().nonnegative().optional(),
      plannedDistanceKm: z.number().nonnegative().optional(),
      actualDistanceKm: z.number().nonnegative().optional(),
      plannedCostEstimate: z.number().nonnegative().optional(),
      actualCost: z.number().nonnegative().optional(),
      selectedPlanId: optionalId,
      planningStatus: z
        .enum(["EMPTY", "PLANNING", "READY", "STALE", "FAILED"])
        .optional(),
      planningFingerprint: z.string().optional(),
      planningWarning: z.string().optional(),
      notes: z.string().optional(),
      plans: z.array(transitPlanSchema).optional(),
    }),
  }),
  z.object({
    ...eventBase,
    type: z.literal("NOTE"),
    detail: z.object({ body: z.string() }),
  }),
])

const journeySchema = z.object({
  id: optionalId,
  ownerId: optionalId,
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  status: z.enum(JOURNEY_STATUSES),
  events: z.array(eventSchema),
  links: z.array(
    z.object({
      id: z.string().trim().min(1),
      journeyId: optionalId,
      fromEventId: z.string().trim().min(1),
      toEventId: z.string().trim().min(1),
      kind: z.enum(JOURNEY_EVENT_LINK_KINDS),
      branchKey: z.string().trim().min(1).optional(),
      rank: z.string().trim().min(1).optional(),
      createdAt: optionalDateTime,
      updatedAt: optionalDateTime,
    })
  ),
})

export type JourneyValidationResult =
  | { ok: true; data: JourneyInput }
  | { ok: false; error: string }

export function validateJourneyInput(input: unknown): JourneyValidationResult {
  const parsed = journeySchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid journey",
    }
  }

  const data = deriveSectionTimes(parsed.data as JourneyInput)
  const graph = validateJourneyGraph(data)
  if (!graph.ok) return graph
  return { ok: true, data }
}
