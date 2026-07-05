import type {
  EdgeStatus,
  NodeCategory,
  RouteEdgeInput,
  RouteInput,
  RouteNodeInput,
  SubPlanEdgeInput,
  SubPlanInput,
  SubPlanNodeInput,
  TransportMode,
} from "@/types/route"
import { EDGE_STATUSES, NODE_CATEGORIES, TRANSPORT_MODES } from "@/types/route"
import {
  validateRoutePathGraph,
  validateSubPlanPathGraph,
} from "@/lib/routes/path-graph"

export type ValidationResult<TData> =
  | { ok: true; data: TData }
  | { ok: false; error: string }

export interface RouteValidationOptions {
  allowEmpty?: boolean
  allowEmptySubPlans?: boolean
}

const edgeStatusSet = new Set<string>(EDGE_STATUSES)
const transportModeSet = new Set<string>(TRANSPORT_MODES)
const nodeCategorySet = new Set<string>(NODE_CATEGORIES)

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string"
}

function trimOptionalString(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function validateId(value: unknown, context: string): ValidationResult<string> {
  if (typeof value !== "string" || value.trim().length === 0) {
    return { ok: false, error: `${context}: id must be a non-empty string` }
  }

  return { ok: true, data: value.trim() }
}

function validateOptionalId(
  value: unknown,
  context: string
): ValidationResult<string | undefined> {
  if (value === undefined) {
    return { ok: true, data: undefined }
  }

  return validateId(value, context)
}

function validateLatLng(
  lat: unknown,
  lng: unknown,
  context: string
): string | null {
  if (typeof lat !== "number" || typeof lng !== "number") {
    return `${context}: lat and lng must be numbers`
  }

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return `${context}: lat must be between -90 and 90`
  }

  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return `${context}: lng must be between -180 and 180`
  }

  return null
}

function validateOrder(
  value: unknown,
  context: string
): ValidationResult<number> {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return {
      ok: false,
      error: `${context}: order must be a non-negative integer`,
    }
  }

  return { ok: true, data: value }
}

function validateOptionalMinuteValue(
  value: unknown,
  context: string
): ValidationResult<number | undefined> {
  if (value === undefined || value === null) {
    return { ok: true, data: undefined }
  }

  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return {
      ok: false,
      error: `${context}: durationMinutes must be a non-negative integer`,
    }
  }

  return { ok: true, data: value }
}

function validateOptionalNonNegativeNumber(
  value: unknown,
  fieldName: string,
  context: string
): ValidationResult<number | undefined> {
  if (value === undefined || value === null) {
    return { ok: true, data: undefined }
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return {
      ok: false,
      error: `${context}: ${fieldName} must be a non-negative number`,
    }
  }

  return { ok: true, data: value }
}

function validateNodeCategory(
  value: unknown,
  context: string
): ValidationResult<NodeCategory> {
  if (typeof value !== "string" || !nodeCategorySet.has(value)) {
    return {
      ok: false,
      error: `${context}: category must be one of ${NODE_CATEGORIES.join(", ")}`,
    }
  }

  return { ok: true, data: value as NodeCategory }
}

function validateEdgeStatus(
  value: unknown,
  context: string
): ValidationResult<EdgeStatus> {
  if (typeof value !== "string" || !edgeStatusSet.has(value)) {
    return {
      ok: false,
      error: `${context}: status must be one of ${EDGE_STATUSES.join(", ")}`,
    }
  }

  return { ok: true, data: value as EdgeStatus }
}

function validateOptionalTransportMode(
  value: unknown,
  context: string
): ValidationResult<TransportMode | undefined> {
  if (value === undefined || value === null) {
    return { ok: true, data: undefined }
  }

  if (typeof value !== "string" || !transportModeSet.has(value)) {
    return {
      ok: false,
      error: `${context}: transportMode must be one of ${TRANSPORT_MODES.join(", ")}`,
    }
  }

  return { ok: true, data: value as TransportMode }
}

function validatePathNode(
  input: unknown,
  context: string
): ValidationResult<RouteNodeInput | SubPlanNodeInput> {
  if (!isRecord(input)) {
    return { ok: false, error: `${context}: node must be an object` }
  }

  const id = validateId(input.id, context)
  if (!id.ok) return id

  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    return { ok: false, error: `${context}: name is required` }
  }

  const latLngError = validateLatLng(input.lat, input.lng, context)
  if (latLngError) return { ok: false, error: latLngError }
  const lat = input.lat as number
  const lng = input.lng as number

  const placeId = validateOptionalId(input.placeId, `${context}: placeId`)
  if (!placeId.ok) return placeId

  if (!isOptionalString(input.coordinateSystem)) {
    return { ok: false, error: `${context}: coordinateSystem must be a string` }
  }

  if (!isOptionalString(input.coordinateProvider)) {
    return {
      ok: false,
      error: `${context}: coordinateProvider must be a string`,
    }
  }

  if (!isOptionalString(input.providerPlaceId)) {
    return { ok: false, error: `${context}: providerPlaceId must be a string` }
  }

  const order = validateOrder(input.order, context)
  if (!order.ok) return order

  const category = validateNodeCategory(input.category, context)
  if (!category.ok) return category

  const durationMinutes = validateOptionalMinuteValue(
    input.durationMinutes,
    context
  )
  if (!durationMinutes.ok) return durationMinutes

  if (!isOptionalString(input.notes)) {
    return { ok: false, error: `${context}: notes must be a string` }
  }

  return {
    ok: true,
    data: {
      id: id.data,
      name: input.name.trim(),
      lat,
      lng,
      placeId: placeId.data,
      coordinateSystem: trimOptionalString(input.coordinateSystem),
      coordinateProvider: trimOptionalString(input.coordinateProvider),
      providerPlaceId: trimOptionalString(input.providerPlaceId),
      order: order.data,
      category: category.data,
      durationMinutes: durationMinutes.data,
      notes: trimOptionalString(input.notes),
    },
  }
}

function validatePathEdge(
  input: unknown,
  context: string
): ValidationResult<RouteEdgeInput | SubPlanEdgeInput> {
  if (!isRecord(input)) {
    return { ok: false, error: `${context}: edge must be an object` }
  }

  const id = validateId(input.id, context)
  if (!id.ok) return id

  const fromNodeId = validateId(input.fromNodeId, `${context}: fromNodeId`)
  if (!fromNodeId.ok) return fromNodeId

  const toNodeId = validateId(input.toNodeId, `${context}: toNodeId`)
  if (!toNodeId.ok) return toNodeId

  if (fromNodeId.data === toNodeId.data) {
    return {
      ok: false,
      error: `${context}: fromNodeId and toNodeId must differ`,
    }
  }

  const status = validateEdgeStatus(input.status, context)
  if (!status.ok) return status

  const transportMode = validateOptionalTransportMode(
    input.transportMode,
    context
  )
  if (!transportMode.ok) return transportMode

  const durationMinutes = validateOptionalMinuteValue(
    input.durationMinutes,
    context
  )
  if (!durationMinutes.ok) return durationMinutes

  const distanceKm = validateOptionalNonNegativeNumber(
    input.distanceKm,
    "distanceKm",
    context
  )
  if (!distanceKm.ok) return distanceKm

  const costEstimate = validateOptionalNonNegativeNumber(
    input.costEstimate,
    "costEstimate",
    context
  )
  if (!costEstimate.ok) return costEstimate

  if (!isOptionalString(input.notes)) {
    return { ok: false, error: `${context}: notes must be a string` }
  }

  return {
    ok: true,
    data: {
      id: id.data,
      fromNodeId: fromNodeId.data,
      toNodeId: toNodeId.data,
      status: status.data,
      transportMode: transportMode.data,
      durationMinutes: durationMinutes.data,
      distanceKm: distanceKm.data,
      costEstimate: costEstimate.data,
      notes: trimOptionalString(input.notes),
    },
  }
}

function validateRouteNode(
  input: unknown,
  index: number
): ValidationResult<RouteNodeInput> {
  const node = validatePathNode(input, `Invalid route node at index ${index}`)
  if (!node.ok) return node

  if (isRecord(input)) {
    const routeId = validateOptionalId(
      input.routeId,
      `Invalid route node at index ${index}: routeId`
    )
    if (!routeId.ok) return routeId

    return {
      ok: true,
      data: {
        ...node.data,
        routeId: routeId.data,
      },
    }
  }

  return node as ValidationResult<RouteNodeInput>
}

function validateSubPlanNode(
  input: unknown,
  index: number,
  subPlanIndex: number
): ValidationResult<SubPlanNodeInput> {
  const node = validatePathNode(
    input,
    `Invalid subplan node at subPlans[${subPlanIndex}].nodes[${index}]`
  )
  if (!node.ok) return node

  if (isRecord(input)) {
    const subPlanId = validateOptionalId(
      input.subPlanId,
      `Invalid subplan node at subPlans[${subPlanIndex}].nodes[${index}]: subPlanId`
    )
    if (!subPlanId.ok) return subPlanId

    return {
      ok: true,
      data: {
        ...node.data,
        subPlanId: subPlanId.data,
      },
    }
  }

  return node as ValidationResult<SubPlanNodeInput>
}

function validateRouteEdge(
  input: unknown,
  index: number
): ValidationResult<RouteEdgeInput> {
  const edge = validatePathEdge(input, `Invalid route edge at index ${index}`)
  if (!edge.ok) return edge

  if (isRecord(input)) {
    const routeId = validateOptionalId(
      input.routeId,
      `Invalid route edge at index ${index}: routeId`
    )
    if (!routeId.ok) return routeId

    return {
      ok: true,
      data: {
        ...edge.data,
        routeId: routeId.data,
      },
    }
  }

  return edge as ValidationResult<RouteEdgeInput>
}

function validateSubPlanEdge(
  input: unknown,
  index: number,
  subPlanIndex: number
): ValidationResult<SubPlanEdgeInput> {
  const edge = validatePathEdge(
    input,
    `Invalid subplan edge at subPlans[${subPlanIndex}].edges[${index}]`
  )
  if (!edge.ok) return edge

  if (isRecord(input)) {
    const subPlanId = validateOptionalId(
      input.subPlanId,
      `Invalid subplan edge at subPlans[${subPlanIndex}].edges[${index}]: subPlanId`
    )
    if (!subPlanId.ok) return subPlanId

    return {
      ok: true,
      data: {
        ...edge.data,
        subPlanId: subPlanId.data,
      },
    }
  }

  return edge as ValidationResult<SubPlanEdgeInput>
}

function validateSubPlan(
  input: unknown,
  index: number
): ValidationResult<SubPlanInput> {
  if (!isRecord(input)) {
    return {
      ok: false,
      error: `Invalid subplan at index ${index}: object required`,
    }
  }

  const id = validateId(input.id, `Invalid subplan at index ${index}`)
  if (!id.ok) return id

  const routeNodeId = validateId(
    input.routeNodeId,
    `Invalid subplan at index ${index}: routeNodeId`
  )
  if (!routeNodeId.ok) return routeNodeId

  if (!Array.isArray(input.nodes)) {
    return {
      ok: false,
      error: `Invalid subplan at index ${index}: nodes must be an array`,
    }
  }

  if (!Array.isArray(input.edges)) {
    return {
      ok: false,
      error: `Invalid subplan at index ${index}: edges must be an array`,
    }
  }

  const nodes: SubPlanNodeInput[] = []
  for (const [nodeIndex, node] of input.nodes.entries()) {
    const result = validateSubPlanNode(node, nodeIndex, index)
    if (!result.ok) return result
    nodes.push({
      ...result.data,
      subPlanId: result.data.subPlanId ?? id.data,
    })
  }

  const edges: SubPlanEdgeInput[] = []
  for (const [edgeIndex, edge] of input.edges.entries()) {
    const result = validateSubPlanEdge(edge, edgeIndex, index)
    if (!result.ok) return result
    edges.push({
      ...result.data,
      subPlanId: result.data.subPlanId ?? id.data,
    })
  }

  return {
    ok: true,
    data: {
      id: id.data,
      routeNodeId: routeNodeId.data,
      nodes,
      edges,
    },
  }
}

export function validateRouteShape(
  input: unknown
): ValidationResult<RouteInput> {
  if (!isRecord(input)) {
    return { ok: false, error: "Invalid route data: object required" }
  }

  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    return { ok: false, error: "Invalid route data: name is required" }
  }

  if (!isOptionalString(input.description)) {
    return {
      ok: false,
      error: "Invalid route data: description must be a string",
    }
  }

  const id = validateOptionalId(input.id, "Invalid route data")
  if (!id.ok) return id

  const ownerId = validateOptionalId(
    input.ownerId,
    "Invalid route data: ownerId"
  )
  if (!ownerId.ok) return ownerId

  if (!Array.isArray(input.nodes)) {
    return { ok: false, error: "Invalid route data: nodes must be an array" }
  }

  if (!Array.isArray(input.edges)) {
    return { ok: false, error: "Invalid route data: edges must be an array" }
  }

  const nodes: RouteNodeInput[] = []
  for (const [index, node] of input.nodes.entries()) {
    const result = validateRouteNode(node, index)
    if (!result.ok) return result
    nodes.push({
      ...result.data,
      routeId: result.data.routeId ?? id.data,
    })
  }

  const edges: RouteEdgeInput[] = []
  for (const [index, edge] of input.edges.entries()) {
    const result = validateRouteEdge(edge, index)
    if (!result.ok) return result
    edges.push({
      ...result.data,
      routeId: result.data.routeId ?? id.data,
    })
  }

  if (input.subPlans !== undefined && !Array.isArray(input.subPlans)) {
    return { ok: false, error: "Invalid route data: subPlans must be an array" }
  }

  const subPlans: SubPlanInput[] = []
  for (const [index, subPlan] of (input.subPlans ?? []).entries()) {
    const result = validateSubPlan(subPlan, index)
    if (!result.ok) return result
    subPlans.push(result.data)
  }

  return {
    ok: true,
    data: {
      id: id.data,
      ownerId: ownerId.data,
      name: input.name.trim(),
      description: trimOptionalString(input.description),
      nodes,
      edges,
      subPlans,
    },
  }
}

export function validateRouteInput(
  input: unknown,
  options: RouteValidationOptions = {}
): ValidationResult<RouteInput> {
  const shape = validateRouteShape(input)
  if (!shape.ok) return shape

  const routeGraph = validateRoutePathGraph(shape.data, {
    allowEmpty: options.allowEmpty,
  })
  if (!routeGraph.ok) return routeGraph

  const routeNodeIds = new Set(shape.data.nodes.map((node) => node.id))
  const subPlanRouteNodeIds = new Set<string>()

  for (const subPlan of shape.data.subPlans ?? []) {
    if (!routeNodeIds.has(subPlan.routeNodeId)) {
      return {
        ok: false,
        error: `Invalid subplan ${subPlan.id}: routeNodeId must reference a route node`,
      }
    }

    if (subPlanRouteNodeIds.has(subPlan.routeNodeId)) {
      return {
        ok: false,
        error: `Invalid subplan ${subPlan.id}: each route node can have only one subplan`,
      }
    }
    subPlanRouteNodeIds.add(subPlan.routeNodeId)

    const subPlanGraph = validateSubPlanPathGraph(subPlan, {
      allowEmpty: options.allowEmptySubPlans ?? options.allowEmpty,
      graphName: `subplan path graph ${subPlan.id}`,
    })
    if (!subPlanGraph.ok) return subPlanGraph
  }

  return shape
}

export function validateDraftRouteInput(
  input: unknown
): ValidationResult<RouteInput> {
  return validateRouteInput(input, {
    allowEmpty: true,
    allowEmptySubPlans: true,
  })
}
