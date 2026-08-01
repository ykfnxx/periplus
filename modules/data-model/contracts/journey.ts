import { z } from "zod"
import {
  TARGET_ACTOR_KINDS,
  TARGET_COORDINATE_SYSTEMS,
  TARGET_EVENT_EXECUTION_STATUSES,
  TARGET_EVENT_ORIGINS,
  TARGET_EVENT_PLACEMENT_STATUSES,
  TARGET_GEOMETRY_KINDS,
  TARGET_JOURNEY_STATUSES,
  TARGET_JOURNEY_VISIBILITIES,
  TARGET_LINK_KINDS,
  TARGET_PROJECTION_MODES,
  TARGET_TRAFFIC_BASES,
  TARGET_TRANSIT_PREFERENCES,
  TARGET_TRANSIT_REQUEST_MODES,
  TARGET_TRANSIT_RUN_STATUSES,
  TARGET_TRANSIT_SEGMENT_MODES,
  TARGET_TRANSPORT_MODES,
  TARGET_VALUE_SOURCES,
} from "./enums"

const idSchema = z.string().trim().min(1)
const dateTimeSchema = z.iso.datetime({ offset: true })
const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "localDate must use YYYY-MM-DD")
const revisionSchema = z.number().int().positive()
const optionalRevisionSchema = revisionSchema.nullable().optional()

export const targetActorReferenceSchema = z
  .object({
    kind: z.enum(TARGET_ACTOR_KINDS),
    userId: idSchema.optional(),
    agentRunId: idSchema.optional(),
  })
  .superRefine((actor, context) => {
    if (actor.kind === "USER" && !actor.userId) {
      context.addIssue({
        code: "custom",
        path: ["userId"],
        message: "USER actor requires userId",
      })
    }
    if (actor.kind === "AGENT" && !actor.agentRunId) {
      context.addIssue({
        code: "custom",
        path: ["agentRunId"],
        message: "AGENT actor requires agentRunId",
      })
    }
  })

export const targetLocationDetailSchema = z.object({
  plannedPlaceId: idSchema.optional(),
  actualPlaceId: idSchema.optional(),
  plannedLat: z.number().min(-90).max(90),
  plannedLng: z.number().min(-180).max(180),
  actualLat: z.number().min(-90).max(90).optional(),
  actualLng: z.number().min(-180).max(180).optional(),
  coordinateSystem: z.enum(TARGET_COORDINATE_SYSTEMS),
  coordinateProvider: z.string().trim().min(1).optional(),
  providerPlaceId: idSchema.optional(),
  plannedDurationMinutes: z.number().int().nonnegative().optional(),
  actualDurationMinutes: z.number().int().nonnegative().optional(),
})

const targetEventIdentitySchema = z.object({
  id: idSchema,
  journeyId: idSchema,
  parentSectionEventId: idSchema.nullable(),
  placementStatus: z.enum(TARGET_EVENT_PLACEMENT_STATUSES),
  origin: z.enum(TARGET_EVENT_ORIGINS),
  title: z.string().trim().min(1),
  description: z.string().optional(),
  introducedRevision: revisionSchema,
  retiredRevision: optionalRevisionSchema,
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
})

const targetExecutableEventFields = {
  executionStatus: z.enum(TARGET_EVENT_EXECUTION_STATUSES),
  plannedStartAt: dateTimeSchema.optional(),
  plannedEndAt: dateTimeSchema.optional(),
  actualStartAt: dateTimeSchema.optional(),
  actualEndAt: dateTimeSchema.optional(),
}

export const targetSectionDetailSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("DAY"),
    localDate: localDateSchema,
    timezone: z.string().trim().min(1),
  }),
  z.object({
    kind: z.literal("CITY"),
    placeId: idSchema.optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    coordinateSystem: z.enum(TARGET_COORDINATE_SYSTEMS).optional(),
  }),
  z.object({
    kind: z.literal("THEME"),
    sourcePackId: idSchema.optional(),
  }),
])

const targetSectionEventSchema = targetEventIdentitySchema.extend({
  type: z.literal("SECTION"),
  detail: targetSectionDetailSchema,
})

const targetVisitEventSchema = targetEventIdentitySchema.extend({
  ...targetExecutableEventFields,
  type: z.literal("VISIT"),
  detail: targetLocationDetailSchema,
})

const targetStayEventSchema = targetEventIdentitySchema.extend({
  ...targetExecutableEventFields,
  type: z.literal("STAY"),
  detail: targetLocationDetailSchema.extend({
    checkInNote: z.string().optional(),
  }),
})

const targetMealEventSchema = targetEventIdentitySchema.extend({
  ...targetExecutableEventFields,
  type: z.literal("MEAL"),
  detail: targetLocationDetailSchema.extend({
    cuisine: z.string().optional(),
  }),
})

const targetActivityEventSchema = targetEventIdentitySchema.extend({
  ...targetExecutableEventFields,
  type: z.literal("ACTIVITY"),
  detail: targetLocationDetailSchema.extend({
    bookingReference: z.string().optional(),
  }),
})

export const targetTransitEventDetailSchema = z.object({
  plannedFromEventId: idSchema.optional(),
  plannedToEventId: idSchema.optional(),
  actualFromEventId: idSchema.optional(),
  actualToEventId: idSchema.optional(),
  transportMode: z.enum(TARGET_TRANSPORT_MODES),
  requestMode: z.enum(TARGET_TRANSIT_REQUEST_MODES).optional(),
  preference: z.enum(TARGET_TRANSIT_PREFERENCES).optional(),
  plannedDepartAt: dateTimeSchema.optional(),
  actualDepartAt: dateTimeSchema.optional(),
  plannedDurationMinutes: z.number().int().nonnegative().optional(),
  actualDurationMinutes: z.number().int().nonnegative().optional(),
  plannedDistanceKm: z.number().nonnegative().optional(),
  actualDistanceKm: z.number().nonnegative().optional(),
  plannedCostEstimate: z.number().nonnegative().optional(),
  actualCost: z.number().nonnegative().optional(),
  activePlanningRunId: idSchema.optional(),
  selectedPlanId: idSchema.optional(),
  routeState: z.enum(["EMPTY", "READY", "ROUTE_STALE"]),
  notes: z.string().optional(),
})

const targetTransitEventSchema = targetEventIdentitySchema.extend({
  ...targetExecutableEventFields,
  type: z.literal("TRANSIT"),
  detail: targetTransitEventDetailSchema,
})

const targetNoteEventSchema = targetEventIdentitySchema.extend({
  type: z.literal("NOTE"),
  detail: z.object({ body: z.string() }),
})

export const targetJourneyEventSchema = z.discriminatedUnion("type", [
  targetSectionEventSchema,
  targetVisitEventSchema,
  targetTransitEventSchema,
  targetStayEventSchema,
  targetMealEventSchema,
  targetActivityEventSchema,
  targetNoteEventSchema,
])

const targetEventCreateBase = {
  id: idSchema.optional(),
  origin: z.enum(TARGET_EVENT_ORIGINS).default("USER_INSERTED"),
  title: z.string().trim().min(1),
  description: z.string().optional(),
}

const targetExecutableEventCreateFields = {
  executionStatus: z.enum(TARGET_EVENT_EXECUTION_STATUSES).default("PLANNED"),
  plannedStartAt: dateTimeSchema.optional(),
  plannedEndAt: dateTimeSchema.optional(),
  actualStartAt: dateTimeSchema.optional(),
  actualEndAt: dateTimeSchema.optional(),
}

export const targetJourneyEventCreateSchema = z.discriminatedUnion("type", [
  z.object({
    ...targetEventCreateBase,
    type: z.literal("SECTION"),
    detail: targetSectionDetailSchema,
  }),
  z.object({
    ...targetEventCreateBase,
    ...targetExecutableEventCreateFields,
    type: z.literal("VISIT"),
    detail: targetLocationDetailSchema,
  }),
  z.object({
    ...targetEventCreateBase,
    ...targetExecutableEventCreateFields,
    type: z.literal("TRANSIT"),
    detail: targetTransitEventDetailSchema.omit({
      activePlanningRunId: true,
      selectedPlanId: true,
    }),
  }),
  z.object({
    ...targetEventCreateBase,
    ...targetExecutableEventCreateFields,
    type: z.literal("STAY"),
    detail: targetLocationDetailSchema.extend({
      checkInNote: z.string().optional(),
    }),
  }),
  z.object({
    ...targetEventCreateBase,
    ...targetExecutableEventCreateFields,
    type: z.literal("MEAL"),
    detail: targetLocationDetailSchema.extend({
      cuisine: z.string().optional(),
    }),
  }),
  z.object({
    ...targetEventCreateBase,
    ...targetExecutableEventCreateFields,
    type: z.literal("ACTIVITY"),
    detail: targetLocationDetailSchema.extend({
      bookingReference: z.string().optional(),
    }),
  }),
  z.object({
    ...targetEventCreateBase,
    type: z.literal("NOTE"),
    detail: z.object({ body: z.string() }),
  }),
])

export const targetJourneyEventLinkSchema = z.object({
  id: idSchema,
  journeyId: idSchema,
  fromEventId: idSchema,
  toEventId: idSchema,
  kind: z.enum(TARGET_LINK_KINDS),
  branchKey: idSchema.optional(),
  rank: z.number().int().nonnegative(),
  introducedRevision: revisionSchema,
  retiredRevision: optionalRevisionSchema,
})

export const targetJourneyEventLinkCreateSchema = z.object({
  id: idSchema.optional(),
  fromEventId: idSchema,
  toEventId: idSchema,
  kind: z.enum(TARGET_LINK_KINDS),
  branchKey: idSchema.optional(),
  rank: z.number().int().nonnegative(),
})

export const targetJourneyEventReplacementSchema = z.object({
  id: idSchema,
  journeyId: idSchema,
  predecessorEventId: idSchema,
  successorEventId: idSchema,
  revision: revisionSchema,
  reason: z.string().trim().min(1),
})

export const targetJourneyBranchSelectionSchema = z
  .object({
    id: idSchema,
    journeyId: idSchema,
    forkEventId: idSchema,
    selectedLinkId: idSchema,
    journeyRevision: revisionSchema,
    supersedesId: idSchema.optional(),
    actor: targetActorReferenceSchema,
    reason: z.string().optional(),
    createdAt: dateTimeSchema,
  })
  .strict()

const targetTransitTrafficSectionSchema = z.object({
  status: z.enum(["UNKNOWN", "FREE_FLOW", "SLOW", "CONGESTED", "SEVERE"]),
  positions: z.array(z.tuple([z.number(), z.number()])),
})

export const targetTransitSegmentSchema = z.object({
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

export const targetTransitPlanSchema = z.object({
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
    if (run.status === "FAILED" && run.plans.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["plans"],
        message: "FAILED planning run cannot contain plans",
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
    }
  })

export const targetJourneyGraphSnapshotSchema = z
  .object({
    id: idSchema,
    ownerId: idSchema,
    revision: revisionSchema,
    status: z.enum(TARGET_JOURNEY_STATUSES),
    visibility: z.enum(TARGET_JOURNEY_VISIBILITIES),
    title: z.string().trim().min(1),
    description: z.string().optional(),
    deletedAt: dateTimeSchema.optional(),
    events: z.array(targetJourneyEventSchema),
    links: z.array(targetJourneyEventLinkSchema),
    replacements: z.array(targetJourneyEventReplacementSchema),
    branchSelections: z.array(targetJourneyBranchSelectionSchema),
    transitPlanningRuns: z.array(targetTransitPlanningRunSchema),
    eventAssetLinks: z.array(idSchema),
    observations: z.array(idSchema),
    eventSourceLinks: z.array(idSchema),
  })
  .superRefine((graph, context) => {
    const events = new Map(graph.events.map((event) => [event.id, event]))
    const activeLinks = graph.links.filter((link) => !link.retiredRevision)
    const activeLinkById = new Map(activeLinks.map((link) => [link.id, link]))

    if (events.size !== graph.events.length) {
      context.addIssue({
        code: "custom",
        path: ["events"],
        message: "event ids must be unique",
      })
    }
    if (
      new Set(graph.links.map((link) => link.id)).size !== graph.links.length
    ) {
      context.addIssue({
        code: "custom",
        path: ["links"],
        message: "link ids must be unique",
      })
    }

    for (const event of graph.events) {
      if (event.journeyId !== graph.id) {
        context.addIssue({
          code: "custom",
          path: ["events"],
          message: `event ${event.id} must belong to graph journey`,
        })
      }
      if (event.parentSectionEventId) {
        const parent = events.get(event.parentSectionEventId)
        if (!parent || parent.type !== "SECTION") {
          context.addIssue({
            code: "custom",
            path: ["events"],
            message: `event ${event.id} requires an existing SECTION parent`,
          })
        }
      }
    }

    for (const link of activeLinks) {
      if (link.journeyId !== graph.id) {
        context.addIssue({
          code: "custom",
          path: ["links"],
          message: `link ${link.id} must belong to graph journey`,
        })
      }
      const from = events.get(link.fromEventId)
      const to = events.get(link.toEventId)
      if (!from || !to) {
        context.addIssue({
          code: "custom",
          path: ["links"],
          message: `link ${link.id} requires existing endpoints`,
        })
        continue
      }
      if (
        from.placementStatus !== "SCHEDULED" ||
        to.placementStatus !== "SCHEDULED"
      ) {
        context.addIssue({
          code: "custom",
          path: ["links"],
          message: `link ${link.id} cannot reference UNSCHEDULED events`,
        })
      }
      if (from.parentSectionEventId !== to.parentSectionEventId) {
        context.addIssue({
          code: "custom",
          path: ["links"],
          message: `link ${link.id} endpoints must share scope`,
        })
      }
    }

    const predecessorIds = new Set<string>()
    const successorIds = new Set<string>()
    for (const replacement of graph.replacements) {
      const predecessor = events.get(replacement.predecessorEventId)
      const successor = events.get(replacement.successorEventId)
      if (
        replacement.journeyId !== graph.id ||
        !predecessor ||
        !successor ||
        predecessor.id === successor.id ||
        predecessor.parentSectionEventId !== successor.parentSectionEventId
      ) {
        context.addIssue({
          code: "custom",
          path: ["replacements"],
          message: `replacement ${replacement.id} requires distinct same-scope events in the graph journey`,
        })
      }
      if (
        predecessorIds.has(replacement.predecessorEventId) ||
        successorIds.has(replacement.successorEventId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["replacements"],
          message: "replacement lineage must be one-to-one",
        })
      }
      predecessorIds.add(replacement.predecessorEventId)
      successorIds.add(replacement.successorEventId)
    }

    const currentSelections = graph.branchSelections.filter(
      (selection) =>
        !graph.branchSelections.some(
          (candidate) => candidate.supersedesId === selection.id
        )
    )
    const selectedForks = new Set<string>()
    for (const selection of currentSelections) {
      if (selection.journeyId !== graph.id) {
        context.addIssue({
          code: "custom",
          path: ["branchSelections"],
          message: `selection ${selection.id} must belong to graph journey`,
        })
      }
      if (selectedForks.has(selection.forkEventId)) {
        context.addIssue({
          code: "custom",
          path: ["branchSelections"],
          message: `fork ${selection.forkEventId} has multiple current selections`,
        })
      }
      selectedForks.add(selection.forkEventId)
      const link = activeLinkById.get(selection.selectedLinkId)
      if (!link || link.fromEventId !== selection.forkEventId) {
        context.addIssue({
          code: "custom",
          path: ["branchSelections"],
          message: `selection ${selection.id} must reference an active outgoing link`,
        })
      }
    }

    const runsById = new Map(
      graph.transitPlanningRuns.map((run) => [run.id, run])
    )
    for (const event of graph.events) {
      if (event.type !== "TRANSIT") continue
      if (event.detail.selectedPlanId && !event.detail.activePlanningRunId) {
        context.addIssue({
          code: "custom",
          path: ["events"],
          message: `transit event ${event.id} cannot select a plan without an active run`,
        })
        continue
      }
      if (!event.detail.activePlanningRunId) continue
      const run = runsById.get(event.detail.activePlanningRunId)
      if (!run || run.transitEventId !== event.id || run.status !== "READY") {
        context.addIssue({
          code: "custom",
          path: ["transitPlanningRuns"],
          message: `transit event ${event.id} requires a READY active planning run`,
        })
        continue
      }
      if (!event.detail.selectedPlanId) {
        context.addIssue({
          code: "custom",
          path: ["events"],
          message: `transit event ${event.id} active run requires a selected plan`,
        })
        continue
      }
      if (!run.plans.some((plan) => plan.id === event.detail.selectedPlanId)) {
        context.addIssue({
          code: "custom",
          path: ["events"],
          message: `transit event ${event.id} selected plan must belong to active run`,
        })
      }
    }
  })

export const targetJourneyRevisionSchema = z.object({
  id: idSchema,
  journeyId: idSchema,
  revision: revisionSchema,
  operation: z.string().trim().min(1),
  snapshot: targetJourneyGraphSnapshotSchema,
  patch: z.unknown(),
  inversePatch: z.unknown(),
  actor: targetActorReferenceSchema,
  idempotencyKey: idSchema,
  parentRevisionId: idSchema.optional(),
  workspaceRevisionId: idSchema.optional(),
  createdAt: dateTimeSchema,
})

export const targetResolvedEventSchema = z.object({
  eventId: idSchema,
  resolvedPosition: z.number().int().nonnegative(),
  locationOrdinal: z.number().int().positive().optional(),
  fromLocationOrdinal: z.number().int().positive().optional(),
  toLocationOrdinal: z.number().int().positive().optional(),
  title: z.string().trim().min(1),
  startAt: dateTimeSchema.optional(),
  endAt: dateTimeSchema.optional(),
  valueSource: z.enum(TARGET_VALUE_SOURCES),
})

export const targetResolvedJourneyProjectionSchema = z.object({
  journeyId: idSchema,
  revision: revisionSchema,
  scopeSectionEventId: idSchema.nullable(),
  mode: z.enum(TARGET_PROJECTION_MODES),
  events: z.array(targetResolvedEventSchema),
})

export type TargetJourneyEvent = z.infer<typeof targetJourneyEventSchema>
export type TargetJourneyEventCreate = z.infer<
  typeof targetJourneyEventCreateSchema
>
export type TargetJourneyEventLink = z.infer<
  typeof targetJourneyEventLinkSchema
>
export type TargetJourneyEventLinkCreate = z.infer<
  typeof targetJourneyEventLinkCreateSchema
>
export type TargetJourneyBranchSelection = z.infer<
  typeof targetJourneyBranchSelectionSchema
>
export type TargetTransitPlanningRun = z.infer<
  typeof targetTransitPlanningRunSchema
>
export type TargetJourneyGraphSnapshot = z.infer<
  typeof targetJourneyGraphSnapshotSchema
>
export type TargetJourneyRevision = z.infer<typeof targetJourneyRevisionSchema>
export type TargetResolvedJourneyProjection = z.infer<
  typeof targetResolvedJourneyProjectionSchema
>
