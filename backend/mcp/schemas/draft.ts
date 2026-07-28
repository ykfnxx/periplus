import { z } from "zod"

const nodeCategorySchema = z.enum([
  "CITY",
  "PLACE",
  "SIGHT",
  "RESTAURANT",
  "HOTEL",
  "ACTIVITY",
  "TRANSIT",
])

const edgeStatusSchema = z.enum(["PLANNED", "INCOMPLETE"])

const transportModeSchema = z.enum([
  "FLIGHT",
  "TRAIN",
  "CAR",
  "BUS",
  "WALK",
  "TAXI",
  "SUBWAY",
  "RENTAL",
])

const requestModeSchema = z.enum(["DRIVE", "WALK", "TRANSIT"])
const routePreferenceSchema = z.enum([
  "RECOMMENDED",
  "FASTEST",
  "LOW_COST",
  "FEWER_TRANSFERS",
  "LESS_WALKING",
])

const nodeCreateSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  placeId: z.string().min(1).optional(),
  coordinateSystem: z.string().min(1).optional(),
  coordinateProvider: z.string().min(1).optional(),
  providerPlaceId: z.string().min(1).optional(),
  category: nodeCategorySchema,
  durationMinutes: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
})

const nodePatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    placeId: z.string().min(1).nullable().optional(),
    coordinateSystem: z.string().min(1).nullable().optional(),
    coordinateProvider: z.string().min(1).nullable().optional(),
    providerPlaceId: z.string().min(1).nullable().optional(),
    category: nodeCategorySchema.optional(),
    durationMinutes: z.number().int().nonnegative().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one patch field is required",
  })

const edgeCreateSchema = z
  .object({
    id: z.string().min(1).optional(),
    fromNodeId: z.string().min(1).optional(),
    toNodeId: z.string().min(1).optional(),
    status: edgeStatusSchema,
    transportMode: transportModeSchema.optional(),
    durationMinutes: z.number().int().nonnegative().optional(),
    distanceKm: z.number().nonnegative().optional(),
    costEstimate: z.number().nonnegative().optional(),
    notes: z.string().optional(),
    requestMode: requestModeSchema.optional(),
    departAt: z.string().datetime({ offset: true }).optional(),
    preference: routePreferenceSchema.optional(),
  })
  .refine(
    (value) => value.status !== "PLANNED" || Boolean(value.transportMode),
    { message: "PLANNED edges require transportMode" }
  )

const edgePatchSchema = z
  .object({
    status: edgeStatusSchema.optional(),
    transportMode: transportModeSchema.nullable().optional(),
    durationMinutes: z.number().int().nonnegative().nullable().optional(),
    distanceKm: z.number().nonnegative().nullable().optional(),
    costEstimate: z.number().nonnegative().nullable().optional(),
    notes: z.string().nullable().optional(),
    requestMode: requestModeSchema.nullable().optional(),
    departAt: z.string().datetime({ offset: true }).nullable().optional(),
    preference: routePreferenceSchema.nullable().optional(),
    selectedPlanId: z.string().min(1).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one patch field is required",
  })

export const getCurrentDraftInputSchema = z.object({})

export const replaceDraftInputSchema = z.object({
  route: z.unknown().nullable(),
})

export const routeAddStartNodeInputSchema = z.object({
  route: z
    .object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
    })
    .optional(),
  node: nodeCreateSchema,
})

export const appendNodeInputSchema = z.object({
  node: nodeCreateSchema,
  edge: edgeCreateSchema,
})

export const insertNodeInputSchema = z.object({
  beforeNodeId: z.string().min(1),
  node: nodeCreateSchema,
  beforeEdge: edgeCreateSchema.optional(),
  afterEdge: edgeCreateSchema,
})

export const removeNodeRangeInputSchema = z.object({
  startNodeId: z.string().min(1),
  endNodeId: z.string().min(1),
  bridgeEdge: edgeCreateSchema.optional(),
})

export const updateNodeInputSchema = z.object({
  nodeId: z.string().min(1),
  patch: nodePatchSchema,
})

export const linkPlaceToNodeInputSchema = z.object({
  nodeId: z.string().min(1),
  routeNodeId: z.string().min(1).optional(),
  place: z.object({
    placeId: z.string().min(1).optional(),
    name: z.string().min(1),
    category: z.string().min(1).optional(),
    address: z.string().optional(),
    providerPlaceId: z.string().min(1).optional(),
    coordinate: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      coordinateSystem: z.string().min(1),
      provider: z.string().min(1),
    }),
  }),
})

export const updateEdgeInputSchema = z
  .object({
    edgeId: z.string().min(1).optional(),
    fromNodeId: z.string().min(1).optional(),
    toNodeId: z.string().min(1).optional(),
    patch: edgePatchSchema,
  })
  .refine(
    (value) =>
      Boolean(value.edgeId) ||
      (Boolean(value.fromNodeId) && Boolean(value.toNodeId)),
    { message: "edgeId or fromNodeId/toNodeId is required" }
  )

export const planEdgeInputSchema = z.object({
  edgeId: z.string().min(1),
  routeNodeId: z.string().min(1).optional(),
})

export const selectRoutePlanInputSchema = planEdgeInputSchema.extend({
  planId: z.string().min(1),
})

export const subPlanCreateInputSchema = z.object({
  routeNodeId: z.string().min(1),
  subPlan: z
    .object({
      id: z.string().min(1).optional(),
      nodes: z
        .array(
          nodeCreateSchema.extend({
            order: z.number().int().nonnegative().optional(),
          })
        )
        .optional(),
      edges: z.array(edgeCreateSchema).optional(),
    })
    .optional(),
})

export const subPlanNodeInputSchema = appendNodeInputSchema.extend({
  routeNodeId: z.string().min(1),
})

export const subPlanInsertNodeInputSchema = insertNodeInputSchema.extend({
  routeNodeId: z.string().min(1),
})

export const subPlanRemoveNodeRangeInputSchema =
  removeNodeRangeInputSchema.extend({
    routeNodeId: z.string().min(1),
  })

export const subPlanUpdateNodeInputSchema = updateNodeInputSchema.extend({
  routeNodeId: z.string().min(1),
})

export const subPlanUpdateEdgeInputSchema = updateEdgeInputSchema.extend({
  routeNodeId: z.string().min(1),
})
