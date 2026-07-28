import { prisma } from "@/modules/data/db/prisma"
import type { AuthContext } from "@/modules/auth/server/context"
import { isAdmin } from "@/modules/auth/server/context"
import type {
  CreateRouteInput,
  RouteDto,
  UpdateRouteInput,
} from "@/types/route"
import { validateRouteInput } from "@/lib/routes/validation"
import { mapRouteToDto } from "./route-mapper"

const routeInclude = {
  nodes: {
    orderBy: { order: "asc" as const },
    include: {
      subPlan: {
        include: {
          nodes: { orderBy: { order: "asc" as const } },
          edges: {
            include: {
              plans: {
                include: { segments: { orderBy: { order: "asc" as const } } },
                orderBy: { rank: "asc" as const },
              },
            },
          },
        },
      },
    },
  },
  edges: {
    include: {
      plans: {
        include: { segments: { orderBy: { order: "asc" as const } } },
        orderBy: { rank: "asc" as const },
      },
    },
  },
}

export class RouteInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "RouteInputError"
  }
}

export class RouteVersionConflictError extends Error {
  constructor(message = "Route was updated by another session") {
    super(message)
    this.name = "RouteVersionConflictError"
  }
}

function validatedRouteInput(input: unknown): CreateRouteInput {
  const result = validateRouteInput(input)
  if (!result.ok) throw new RouteInputError(result.error)
  return result.data
}

function routeScopeWhere(context: AuthContext, id: string) {
  return isAdmin(context) ? { id } : { id, ownerId: context.userId }
}

function routeListWhere(context: AuthContext) {
  return isAdmin(context) ? {} : { ownerId: context.userId }
}

function nodeCreateData(
  routeId: string,
  node: CreateRouteInput["nodes"][number]
) {
  return {
    id: node.id,
    routeId,
    name: node.name,
    lat: node.lat,
    lng: node.lng,
    placeId: node.placeId,
    coordinateSystem: node.coordinateSystem,
    coordinateProvider: node.coordinateProvider,
    providerPlaceId: node.providerPlaceId,
    order: node.order,
    category: node.category,
    durationMinutes: node.durationMinutes,
    notes: node.notes,
  }
}

function edgeCreateData(
  routeId: string,
  edge: CreateRouteInput["edges"][number]
) {
  return {
    id: edge.id,
    routeId,
    fromNodeId: edge.fromNodeId,
    toNodeId: edge.toNodeId,
    status: edge.status,
    transportMode: edge.transportMode,
    durationMinutes: edge.durationMinutes,
    distanceKm: edge.distanceKm,
    costEstimate: edge.costEstimate,
    notes: edge.notes,
    requestMode: edge.requestMode,
    departAt: edge.departAt ? new Date(edge.departAt) : undefined,
    preference: edge.preference,
  }
}

async function writeRouteGraph(
  tx: typeof prisma,
  routeId: string,
  data: CreateRouteInput
) {
  for (const node of data.nodes) {
    await tx.routeNode.create({ data: nodeCreateData(routeId, node) })
  }

  for (const edge of data.edges) {
    await tx.routeEdge.create({ data: edgeCreateData(routeId, edge) })
  }

  for (const subPlan of data.subPlans ?? []) {
    await tx.subPlan.create({
      data: {
        id: subPlan.id,
        routeNodeId: subPlan.routeNodeId,
      },
    })

    for (const node of subPlan.nodes) {
      await tx.subPlanNode.create({
        data: {
          id: node.id,
          subPlanId: subPlan.id,
          name: node.name,
          lat: node.lat,
          lng: node.lng,
          placeId: node.placeId,
          coordinateSystem: node.coordinateSystem,
          coordinateProvider: node.coordinateProvider,
          providerPlaceId: node.providerPlaceId,
          order: node.order,
          category: node.category,
          durationMinutes: node.durationMinutes,
          notes: node.notes,
        },
      })
    }

    for (const edge of subPlan.edges) {
      await tx.subPlanEdge.create({
        data: {
          id: edge.id,
          subPlanId: subPlan.id,
          fromNodeId: edge.fromNodeId,
          toNodeId: edge.toNodeId,
          status: edge.status,
          transportMode: edge.transportMode,
          durationMinutes: edge.durationMinutes,
          distanceKm: edge.distanceKm,
          costEstimate: edge.costEstimate,
          notes: edge.notes,
          requestMode: edge.requestMode,
          departAt: edge.departAt ? new Date(edge.departAt) : undefined,
          preference: edge.preference,
        },
      })
    }
  }
}

export async function listRoutes(context: AuthContext): Promise<RouteDto[]> {
  const routes = await prisma.route.findMany({
    where: routeListWhere(context),
    include: routeInclude,
    orderBy: { updatedAt: "desc" },
  })
  return routes.map(mapRouteToDto)
}

export async function getRoute(
  context: AuthContext,
  id: string
): Promise<RouteDto | null> {
  const route = await prisma.route.findFirst({
    where: routeScopeWhere(context, id),
    include: routeInclude,
  })
  return route ? mapRouteToDto(route) : null
}

export async function createRoute(
  context: AuthContext,
  input: CreateRouteInput
): Promise<RouteDto> {
  const data = validatedRouteInput(input)

  return prisma.$transaction(async (tx) => {
    const route = await tx.route.create({
      data: {
        id: data.id,
        ownerId: context.userId,
        name: data.name,
        description: data.description,
      },
    })
    await writeRouteGraph(tx as typeof prisma, route.id, data)

    const createdRoute = await tx.route.findUnique({
      where: { id: route.id },
      include: routeInclude,
    })
    if (!createdRoute) throw new RouteInputError("Route not found")
    return mapRouteToDto(createdRoute)
  })
}

export async function updateRoute(
  context: AuthContext,
  id: string,
  input: UpdateRouteInput,
  expectedVersion?: number | null
): Promise<RouteDto | null> {
  const existing = await prisma.route.findFirst({
    where: routeScopeWhere(context, id),
  })
  if (!existing) return null

  const data = validatedRouteInput(input)

  return prisma.$transaction(async (tx) => {
    const updated = await tx.route.updateMany({
      where: {
        ...routeScopeWhere(context, id),
        ...(typeof expectedVersion === "number"
          ? { version: expectedVersion }
          : {}),
      },
      data: {
        name: data.name,
        description: data.description,
        version: { increment: 1 },
      },
    })
    if (updated.count === 0) throw new RouteVersionConflictError()

    await tx.subPlan.deleteMany({
      where: { routeNode: { routeId: id } },
    })
    await tx.routeEdge.deleteMany({ where: { routeId: id } })
    await tx.routeNode.deleteMany({ where: { routeId: id } })
    await writeRouteGraph(tx as typeof prisma, id, data)

    const updatedRoute = await tx.route.findUnique({
      where: { id },
      include: routeInclude,
    })
    return updatedRoute ? mapRouteToDto(updatedRoute) : null
  })
}

export async function deleteRoute(
  context: AuthContext,
  id: string
): Promise<boolean> {
  const existing = await prisma.route.findFirst({
    where: routeScopeWhere(context, id),
  })
  if (!existing) return false

  await prisma.route.delete({ where: { id } })
  return true
}
