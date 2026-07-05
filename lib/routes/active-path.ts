import type { PathEdge, PathNode, Route, RouteNode, SubPlan } from "@/types/route"

export type RouteViewLevel = "overview" | "city"

export interface ActivePathView {
  level: RouteViewLevel
  title: string
  routeNode: RouteNode | null
  subPlan: SubPlan | null
  nodes: PathNode[]
  edges: PathEdge[]
  isEmptyCity: boolean
}

export function findRouteSubPlan(route: Route, routeNodeId: string) {
  return route.subPlans.find((subPlan) => subPlan.routeNodeId === routeNodeId) ?? null
}

export function getActivePathView(
  route: Route | null,
  level: RouteViewLevel,
  activeRouteNodeId: string | null
): ActivePathView {
  if (!route) {
    return {
      level: "overview",
      title: "路线预览",
      routeNode: null,
      subPlan: null,
      nodes: [],
      edges: [],
      isEmptyCity: false,
    }
  }

  if (level === "city" && activeRouteNodeId) {
    const routeNode =
      route.nodes.find((node) => node.id === activeRouteNodeId) ?? null
    if (routeNode) {
      const subPlan = findRouteSubPlan(route, routeNode.id)
      return {
        level: "city",
        title: routeNode.name,
        routeNode,
        subPlan,
        nodes: subPlan?.nodes ?? [{ ...routeNode, order: 0 }],
        edges: subPlan?.edges ?? [],
        isEmptyCity: !subPlan,
      }
    }
  }

  return {
    level: "overview",
    title: route.name,
    routeNode: null,
    subPlan: null,
    nodes: route.nodes,
    edges: route.edges,
    isEmptyCity: false,
  }
}
