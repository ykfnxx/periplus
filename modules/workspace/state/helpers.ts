import type { DraftRoute } from "@/types/route"
import type { ChatMessage, ChatMessageRole } from "./types"

export function createChatMessage(
  role: ChatMessageRole,
  content: string
): ChatMessage {
  return { id: `message-${Date.now()}-${Math.random()}`, role, content }
}

export function mapRouteEdges(
  route: DraftRoute | null,
  transform: (
    edge: DraftRoute["edges"][number],
    nodes: DraftRoute["nodes"]
  ) => DraftRoute["edges"][number]
): DraftRoute | null {
  if (!route) return null
  return {
    ...route,
    edges: route.edges.map((edge) => transform(edge, route.nodes)),
    subPlans: route.subPlans.map((subPlan) => ({
      ...subPlan,
      edges: subPlan.edges.map((edge) => transform(edge, subPlan.nodes)),
    })),
  }
}
