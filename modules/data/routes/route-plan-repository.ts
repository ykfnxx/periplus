import { prisma } from "@/modules/data/db/prisma"
import type { PathEdge, Route, RoutePlan } from "@/types/route"

export async function persistRoutePlans(route: Route) {
  await prisma.$transaction(async (tx) => {
    for (const edge of route.edges) {
      await tx.routePlan.deleteMany({ where: { routeEdgeId: edge.id } })
      await writePlans(tx, edge, { routeEdgeId: edge.id })
      await tx.routeEdge.update({
        where: { id: edge.id },
        data: {
          selectedPlanId: edge.selectedPlanId,
          planningStatus: edge.planningStatus,
          planningWarning: edge.planningWarning,
        },
      })
    }
    for (const subPlan of route.subPlans) {
      for (const edge of subPlan.edges) {
        await tx.routePlan.deleteMany({ where: { subPlanEdgeId: edge.id } })
        await writePlans(tx, edge, { subPlanEdgeId: edge.id })
        await tx.subPlanEdge.update({
          where: { id: edge.id },
          data: {
            selectedPlanId: edge.selectedPlanId,
            planningStatus: edge.planningStatus,
            planningWarning: edge.planningWarning,
          },
        })
      }
    }
  })
}

async function writePlans(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  edge: PathEdge,
  owner: { routeEdgeId: string } | { subPlanEdgeId: string }
) {
  for (const plan of edge.plans ?? []) {
    await tx.routePlan.create({
      data: routePlanData(plan, owner),
    })
  }
}

function routePlanData(
  plan: RoutePlan,
  owner: { routeEdgeId: string } | { subPlanEdgeId: string }
) {
  return {
    id: plan.id,
    ...owner,
    provider: plan.provider,
    rank: plan.rank,
    label: plan.label,
    strategy: plan.strategy,
    distanceMeters: plan.distanceMeters,
    durationSeconds: plan.durationSeconds,
    fareAmount: plan.fareAmount,
    trafficBasis: plan.trafficBasis,
    calculatedAt: new Date(plan.calculatedAt),
    validUntil: plan.validUntil ? new Date(plan.validUntil) : undefined,
    requestFingerprint: plan.requestFingerprint,
    segments: {
      create: plan.segments.map((segment) => ({
        id: segment.id,
        order: segment.order,
        mode: segment.mode,
        fromName: segment.fromName,
        toName: segment.toName,
        lineName: segment.lineName,
        distanceMeters: segment.distanceMeters,
        durationSeconds: segment.durationSeconds,
        fareAmount: segment.fareAmount,
        departAt: segment.departAt ? new Date(segment.departAt) : undefined,
        arriveAt: segment.arriveAt ? new Date(segment.arriveAt) : undefined,
        coordinateSystem: segment.coordinateSystem,
        geometryKind: segment.geometryKind,
        positionsJson: JSON.stringify(segment.positions),
        trafficSectionsJson: segment.trafficSections
          ? JSON.stringify(segment.trafficSections)
          : undefined,
      })),
    },
  }
}
