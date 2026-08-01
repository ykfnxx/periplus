import { z } from "zod"
import {
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
import {
  targetActorReferenceSchema,
  targetDateTimeSchema as dateTimeSchema,
  targetIdSchema as idSchema,
} from "./common"
import {
  targetEventAssetLinkSchema,
  targetEventObservationSchema,
  targetEventSourceLinkSchema,
} from "./content"

const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "localDate must use YYYY-MM-DD")
const revisionSchema = z.number().int().positive()
const optionalRevisionSchema = revisionSchema.nullable().optional()

export const targetLocationDetailSchema = z
  .object({
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
  .strict()

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
  z
    .object({
      kind: z.literal("DAY"),
      localDate: localDateSchema,
      timezone: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("CITY"),
      placeId: idSchema.optional(),
      lat: z.number().min(-90).max(90).optional(),
      lng: z.number().min(-180).max(180).optional(),
      coordinateSystem: z.enum(TARGET_COORDINATE_SYSTEMS).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("THEME"),
      sourcePackId: idSchema.optional(),
    })
    .strict(),
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

export const targetTransitEventDetailSchema = z
  .object({
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
  .strict()

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

const targetEventUpdateBase = {
  title: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
}

const targetExecutableEventUpdateFields = {
  executionStatus: z.enum(TARGET_EVENT_EXECUTION_STATUSES).optional(),
  plannedStartAt: dateTimeSchema.nullable().optional(),
  plannedEndAt: dateTimeSchema.nullable().optional(),
  actualStartAt: dateTimeSchema.nullable().optional(),
  actualEndAt: dateTimeSchema.nullable().optional(),
}

export const targetJourneyEventUpdatePatchSchema = z.discriminatedUnion(
  "type",
  [
    z
      .object({
        type: z.literal("SECTION"),
        ...targetEventUpdateBase,
        detail: targetSectionDetailSchema.optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("VISIT"),
        ...targetEventUpdateBase,
        ...targetExecutableEventUpdateFields,
        detail: targetLocationDetailSchema.partial().strict().optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("TRANSIT"),
        ...targetEventUpdateBase,
        ...targetExecutableEventUpdateFields,
        detail: targetTransitEventDetailSchema
          .omit({ activePlanningRunId: true, selectedPlanId: true })
          .partial()
          .strict()
          .optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("STAY"),
        ...targetEventUpdateBase,
        ...targetExecutableEventUpdateFields,
        detail: targetLocationDetailSchema
          .extend({ checkInNote: z.string().optional() })
          .partial()
          .strict()
          .optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("MEAL"),
        ...targetEventUpdateBase,
        ...targetExecutableEventUpdateFields,
        detail: targetLocationDetailSchema
          .extend({ cuisine: z.string().optional() })
          .partial()
          .strict()
          .optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("ACTIVITY"),
        ...targetEventUpdateBase,
        ...targetExecutableEventUpdateFields,
        detail: targetLocationDetailSchema
          .extend({ bookingReference: z.string().optional() })
          .partial()
          .strict()
          .optional(),
      })
      .strict(),
    z
      .object({
        type: z.literal("NOTE"),
        ...targetEventUpdateBase,
        detail: z.object({ body: z.string() }).partial().strict().optional(),
      })
      .strict(),
  ]
)

const targetActualTimeFields = {
  actualStartAt: dateTimeSchema.optional(),
  actualEndAt: dateTimeSchema.optional(),
}

const targetActualLocationFields = {
  actualPlaceId: idSchema.optional(),
  actualLat: z.number().min(-90).max(90).optional(),
  actualLng: z.number().min(-180).max(180).optional(),
  actualDurationMinutes: z.number().int().nonnegative().optional(),
}

export const targetConfirmActualSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("VISIT"),
      ...targetActualTimeFields,
      detail: z.object(targetActualLocationFields).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("STAY"),
      ...targetActualTimeFields,
      detail: z.object(targetActualLocationFields).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("MEAL"),
      ...targetActualTimeFields,
      detail: z.object(targetActualLocationFields).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("ACTIVITY"),
      ...targetActualTimeFields,
      detail: z.object(targetActualLocationFields).strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("TRANSIT"),
      ...targetActualTimeFields,
      detail: z
        .object({
          actualFromEventId: idSchema.optional(),
          actualToEventId: idSchema.optional(),
          actualDepartAt: dateTimeSchema.optional(),
          actualDurationMinutes: z.number().int().nonnegative().optional(),
          actualDistanceKm: z.number().nonnegative().optional(),
          actualCost: z.number().nonnegative().optional(),
        })
        .strict(),
    })
    .strict(),
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
    if (new Set(run.plans.map((plan) => plan.id)).size !== run.plans.length) {
      context.addIssue({
        code: "custom",
        path: ["plans"],
        message: "plan ids must be unique within a planning run",
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
    eventAssetLinks: z.array(targetEventAssetLinkSchema),
    observations: z.array(targetEventObservationSchema),
    eventSourceLinks: z.array(targetEventSourceLinkSchema),
  })
  .superRefine((graph, context) => {
    const addIssue = (path: (string | number)[], message: string) => {
      context.addIssue({ code: "custom", path, message })
    }
    const assertUniqueIds = (
      path: string,
      values: readonly { id: string }[]
    ) => {
      if (new Set(values.map((value) => value.id)).size !== values.length) {
        addIssue([path], `${path} ids must be unique`)
      }
    }
    const assertRevisionBounds = (
      path: string,
      id: string,
      introducedRevision: number,
      retiredRevision?: number | null
    ) => {
      if (introducedRevision > graph.revision) {
        addIssue(
          [path],
          `${path} ${id} cannot be introduced after graph revision`
        )
      }
      if (
        retiredRevision !== undefined &&
        retiredRevision !== null &&
        (retiredRevision < introducedRevision ||
          retiredRevision > graph.revision)
      ) {
        addIssue([path], `${path} ${id} has invalid revision bounds`)
      }
    }

    assertUniqueIds("events", graph.events)
    assertUniqueIds("links", graph.links)
    assertUniqueIds("replacements", graph.replacements)
    assertUniqueIds("branchSelections", graph.branchSelections)
    assertUniqueIds("transitPlanningRuns", graph.transitPlanningRuns)
    assertUniqueIds(
      "transitPlans",
      graph.transitPlanningRuns.flatMap((run) => run.plans)
    )
    assertUniqueIds(
      "transitSegments",
      graph.transitPlanningRuns.flatMap((run) =>
        run.plans.flatMap((plan) => plan.segments)
      )
    )
    assertUniqueIds("eventAssetLinks", graph.eventAssetLinks)
    assertUniqueIds("observations", graph.observations)
    assertUniqueIds("eventSourceLinks", graph.eventSourceLinks)

    const events = new Map(graph.events.map((event) => [event.id, event]))
    const activeLinks = graph.links.filter((link) => !link.retiredRevision)
    const activeLinkById = new Map(activeLinks.map((link) => [link.id, link]))

    for (const event of graph.events) {
      assertRevisionBounds(
        "events",
        event.id,
        event.introducedRevision,
        event.retiredRevision
      )
      if (event.journeyId !== graph.id) {
        addIssue(["events"], `event ${event.id} must belong to graph journey`)
      }
      if (event.parentSectionEventId) {
        const parent = events.get(event.parentSectionEventId)
        if (!parent || parent.type !== "SECTION") {
          addIssue(
            ["events"],
            `event ${event.id} requires an existing SECTION parent`
          )
        } else if (!event.retiredRevision && parent.retiredRevision) {
          addIssue(
            ["events"],
            `active event ${event.id} cannot use a retired SECTION parent`
          )
        }
      }
    }

    for (const event of graph.events) {
      const seen = new Set<string>()
      let cursor: TargetJourneyEvent | undefined = event
      while (cursor?.parentSectionEventId) {
        if (seen.has(cursor.id)) {
          addIssue(["events"], `parent cycle includes event ${cursor.id}`)
          break
        }
        seen.add(cursor.id)
        cursor = events.get(cursor.parentSectionEventId)
      }
    }

    for (const link of graph.links) {
      assertRevisionBounds(
        "links",
        link.id,
        link.introducedRevision,
        link.retiredRevision
      )
      if (link.journeyId !== graph.id) {
        addIssue(["links"], `link ${link.id} must belong to graph journey`)
      }
      const from = events.get(link.fromEventId)
      const to = events.get(link.toEventId)
      if (!from || !to) {
        addIssue(["links"], `link ${link.id} requires existing endpoints`)
        continue
      }
      if (link.retiredRevision) continue
      if (
        from.placementStatus !== "SCHEDULED" ||
        to.placementStatus !== "SCHEDULED"
      ) {
        addIssue(
          ["links"],
          `link ${link.id} cannot reference UNSCHEDULED events`
        )
      }
      if (from.retiredRevision || to.retiredRevision) {
        addIssue(
          ["links"],
          `active link ${link.id} cannot reference retired events`
        )
      }
      if (from.parentSectionEventId !== to.parentSectionEventId) {
        addIssue(["links"], `link ${link.id} endpoints must share scope`)
      }
    }

    const predecessorIds = new Set<string>()
    const successorIds = new Set<string>()
    const successorByPredecessor = new Map<string, string>()
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
        addIssue(
          ["replacements"],
          `replacement ${replacement.id} requires distinct same-scope events in the graph journey`
        )
      }
      if (
        predecessor &&
        successor &&
        (predecessor.retiredRevision !== replacement.revision ||
          successor.introducedRevision !== replacement.revision)
      ) {
        addIssue(
          ["replacements"],
          `replacement ${replacement.id} must retire its predecessor and introduce its successor at the replacement revision`
        )
      }
      if (replacement.revision > graph.revision) {
        addIssue(
          ["replacements"],
          `replacement ${replacement.id} cannot be newer than graph revision`
        )
      }
      if (
        predecessorIds.has(replacement.predecessorEventId) ||
        successorIds.has(replacement.successorEventId)
      ) {
        addIssue(["replacements"], "replacement lineage must be one-to-one")
      }
      predecessorIds.add(replacement.predecessorEventId)
      successorIds.add(replacement.successorEventId)
      successorByPredecessor.set(
        replacement.predecessorEventId,
        replacement.successorEventId
      )
    }
    for (const startId of successorByPredecessor.keys()) {
      const seen = new Set<string>()
      let cursor: string | undefined = startId
      while (cursor) {
        if (seen.has(cursor)) {
          addIssue(
            ["replacements"],
            `replacement lineage contains a cycle at ${cursor}`
          )
          break
        }
        seen.add(cursor)
        cursor = successorByPredecessor.get(cursor)
      }
    }

    const selectionById = new Map(
      graph.branchSelections.map((selection) => [selection.id, selection])
    )
    for (const selection of graph.branchSelections) {
      if (selection.journeyId !== graph.id) {
        addIssue(
          ["branchSelections"],
          `selection ${selection.id} must belong to graph journey`
        )
      }
      if (selection.journeyRevision > graph.revision) {
        addIssue(
          ["branchSelections"],
          `selection ${selection.id} cannot be newer than graph revision`
        )
      }
      const fork = events.get(selection.forkEventId)
      const link = graph.links.find(
        (candidate) => candidate.id === selection.selectedLinkId
      )
      if (!fork || !link || link.fromEventId !== fork.id) {
        addIssue(
          ["branchSelections"],
          `selection ${selection.id} must reference a known fork and outgoing link`
        )
      } else if (
        link.introducedRevision > selection.journeyRevision ||
        (link.retiredRevision !== undefined &&
          link.retiredRevision !== null &&
          link.retiredRevision <= selection.journeyRevision)
      ) {
        addIssue(
          ["branchSelections"],
          `selection ${selection.id} must reference a link active at its revision`
        )
      }
      if (!selection.supersedesId) continue
      const previous = selectionById.get(selection.supersedesId)
      if (
        !previous ||
        previous.journeyId !== selection.journeyId ||
        previous.forkEventId !== selection.forkEventId ||
        previous.journeyRevision >= selection.journeyRevision ||
        previous.createdAt >= selection.createdAt
      ) {
        addIssue(
          ["branchSelections"],
          `selection ${selection.id} has an invalid supersedes relation`
        )
      }
    }
    for (const selection of graph.branchSelections) {
      const seen = new Set<string>()
      let cursor: typeof selection | undefined = selection
      while (cursor?.supersedesId) {
        if (seen.has(cursor.id)) {
          addIssue(
            ["branchSelections"],
            `selection supersession contains a cycle at ${cursor.id}`
          )
          break
        }
        seen.add(cursor.id)
        cursor = selectionById.get(cursor.supersedesId)
      }
    }
    const currentSelections = graph.branchSelections.filter(
      (selection) =>
        !graph.branchSelections.some(
          (candidate) => candidate.supersedesId === selection.id
        )
    )
    const selectedForks = new Set<string>()
    for (const selection of currentSelections) {
      if (selectedForks.has(selection.forkEventId)) {
        addIssue(
          ["branchSelections"],
          `fork ${selection.forkEventId} has multiple current selections`
        )
      }
      selectedForks.add(selection.forkEventId)
      const link = activeLinkById.get(selection.selectedLinkId)
      if (!link || link.fromEventId !== selection.forkEventId) {
        addIssue(
          ["branchSelections"],
          `current selection ${selection.id} must reference an active outgoing link`
        )
      }
    }

    const runsById = new Map(
      graph.transitPlanningRuns.map((run) => [run.id, run])
    )
    for (const event of graph.events) {
      if (event.type !== "TRANSIT") continue
      for (const endpointId of [
        event.detail.plannedFromEventId,
        event.detail.plannedToEventId,
        event.detail.actualFromEventId,
        event.detail.actualToEventId,
      ]) {
        if (!endpointId) continue
        const endpoint = events.get(endpointId)
        if (
          !endpoint ||
          endpoint.retiredRevision ||
          endpoint.placementStatus !== "SCHEDULED" ||
          endpoint.parentSectionEventId !== event.parentSectionEventId
        ) {
          addIssue(
            ["events"],
            `transit event ${event.id} has an invalid endpoint ${endpointId}`
          )
        }
      }
      if (event.detail.selectedPlanId && !event.detail.activePlanningRunId) {
        addIssue(
          ["events"],
          `transit event ${event.id} cannot select a plan without an active run`
        )
        continue
      }
      if (!event.detail.activePlanningRunId) continue
      const run = runsById.get(event.detail.activePlanningRunId)
      if (!run || run.transitEventId !== event.id || run.status !== "READY") {
        addIssue(
          ["transitPlanningRuns"],
          `transit event ${event.id} requires a READY active planning run`
        )
        continue
      }
      if (!event.detail.selectedPlanId) {
        addIssue(
          ["events"],
          `transit event ${event.id} active run requires a selected plan`
        )
        continue
      }
      if (!run.plans.some((plan) => plan.id === event.detail.selectedPlanId)) {
        addIssue(
          ["events"],
          `transit event ${event.id} selected plan must belong to active run`
        )
      }
    }

    for (const run of graph.transitPlanningRuns) {
      const event = events.get(run.transitEventId)
      if (!event || event.type !== "TRANSIT") {
        addIssue(
          ["transitPlanningRuns"],
          `planning run ${run.id} requires a known TRANSIT event`
        )
      }
    }

    const observationById = new Map(
      graph.observations.map((observation) => [observation.id, observation])
    )
    for (const observation of graph.observations) {
      if (!events.has(observation.eventId)) {
        addIssue(
          ["observations"],
          `observation ${observation.id} requires a known event`
        )
      }
      if (!observation.supersedesId) continue
      const previous = observationById.get(observation.supersedesId)
      if (
        !previous ||
        previous.eventId !== observation.eventId ||
        previous.kind !== observation.kind ||
        previous.phase !== observation.phase ||
        previous.createdAt >= observation.createdAt
      ) {
        addIssue(
          ["observations"],
          `observation ${observation.id} has an invalid supersedes relation`
        )
      }
    }
    for (const link of graph.eventAssetLinks) {
      assertRevisionBounds(
        "eventAssetLinks",
        link.id,
        link.introducedRevision,
        link.retiredRevision
      )
      if (link.journeyId !== graph.id) {
        addIssue(
          ["eventAssetLinks"],
          `asset link ${link.id} must belong to graph journey`
        )
      }
      if (!events.has(link.eventId)) {
        addIssue(
          ["eventAssetLinks"],
          `asset link ${link.id} requires a known event`
        )
      }
    }
    for (const link of graph.eventSourceLinks) {
      assertRevisionBounds(
        "eventSourceLinks",
        link.id,
        link.introducedRevision,
        link.retiredRevision
      )
      if (link.journeyId !== graph.id) {
        addIssue(
          ["eventSourceLinks"],
          `source link ${link.id} must belong to graph journey`
        )
      }
      if (!events.has(link.eventId)) {
        addIssue(
          ["eventSourceLinks"],
          `source link ${link.id} requires a known event`
        )
      }
    }
  })

export const targetJourneyRevisionSchema = z
  .object({
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
  .superRefine((revision, context) => {
    if (
      (revision.revision === 1 && revision.parentRevisionId) ||
      (revision.revision > 1 && !revision.parentRevisionId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["parentRevisionId"],
        message: "only the first revision may omit its parent",
      })
    }
    if (
      revision.snapshot.id !== revision.journeyId ||
      revision.snapshot.revision !== revision.revision
    ) {
      context.addIssue({
        code: "custom",
        path: ["snapshot"],
        message: "revision snapshot must match its journey and revision",
      })
    }
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
export type TargetResolvedEvent = z.infer<typeof targetResolvedEventSchema>
export type TargetResolvedJourneyProjection = z.infer<
  typeof targetResolvedJourneyProjectionSchema
>
