import { randomUUID } from "node:crypto"
import type { AuthContext } from "@/lib/auth-context"
import {
  findContinuousNodeRange,
  planAppendNode,
  planInsertNodeBefore,
  planRemoveNodeRange,
  sortPathNodes,
  sortPathEdgesByOrder,
} from "@/lib/routes/path-graph"
import { createRoute, getRoute, updateRoute } from "@/lib/routes/service"
import { validateDraftRouteInput } from "@/lib/routes/validation"
import type {
  PathEdgeCreateInput,
  PathEdgePatchInput,
  PathNodeCreateInput,
  PathNodePatchInput,
  Route,
  RouteEdge,
  RouteInput,
  RouteNode,
  SubPlan,
  SubPlanEdge,
  SubPlanNode,
} from "@/types/route"
import type {
  AgentConversationMessage,
  AppendNodeInput,
  DraftSnapshot,
  DraftToolName,
  InsertNodeInput,
  RemoveNodeRangeInput,
  RouteAddStartNodeInput,
  SessionDraft,
  SubPlanCreateInput,
  SubPlanInsertNodeInput,
  SubPlanNodeInput,
  SubPlanRemoveNodeRangeInput,
  SubPlanUpdateEdgeInput,
  SubPlanUpdateNodeInput,
  ToolCallSuggestionCall,
  ToolCallSuggestionCreateInput,
  UpdateEdgeInput,
  UpdateNodeInput,
} from "./types"

export class DraftInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DraftInputError"
  }
}

function nowIso() {
  return new Date().toISOString()
}

function draftId(prefix: string) {
  return `draft-${prefix}-${randomUUID()}`
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function cloneRoute(route: Route): Route {
  return clone(route)
}

function pendingSuggestionSummaries(session: SessionDraft) {
  return session.pendingSuggestions.map((suggestion) => ({
    id: suggestion.id,
    title: suggestion.title,
    summary: suggestion.summary,
    toolCallCount: suggestion.toolCalls.length,
    draftRevision: suggestion.draftRevision,
    createdAt: suggestion.createdAt,
    updatedAt: suggestion.updatedAt,
  }))
}

function cloneSuggestionToolCalls(toolCalls: ToolCallSuggestionCall[]) {
  return clone(toolCalls)
}

function isPersistedRoute(input: RouteInput | Route): input is Route {
  return (
    typeof (input as Route).createdAt === "string" &&
    typeof (input as Route).updatedAt === "string"
  )
}

function validatedDraftRoute(input: unknown): RouteInput {
  const result = validateDraftRouteInput(input)
  if (!result.ok) throw new DraftInputError(result.error)
  return result.data
}

function toRouteInput(route: Route): RouteInput {
  return {
    id: route.id,
    ownerId: route.ownerId,
    name: route.name,
    description: route.description,
    nodes: sortPathNodes(route.nodes),
    edges: sortPathEdgesByOrder(route.nodes, route.edges),
    subPlans: route.subPlans.map((subPlan) => ({
      ...subPlan,
      nodes: sortPathNodes(subPlan.nodes),
      edges: sortPathEdgesByOrder(subPlan.nodes, subPlan.edges),
    })),
  }
}

function toDraftRoute(input: RouteInput | Route): Route {
  const data = validatedDraftRoute(input)
  const persistedRoute = isPersistedRoute(input) ? input : null
  const timestamp = nowIso()
  const routeId = data.id ?? persistedRoute?.id ?? draftId("route")

  return {
    id: routeId,
    ownerId: data.ownerId ?? persistedRoute?.ownerId ?? "draft-owner",
    name: data.name,
    description: data.description,
    nodes: sortPathNodes(data.nodes).map((node) => ({
      ...node,
      routeId,
    })),
    edges: sortPathEdgesByOrder(data.nodes, data.edges).map((edge) => ({
      ...edge,
      routeId,
    })),
    subPlans: (data.subPlans ?? []).map((subPlan) => {
      const subPlanId = subPlan.id
      return {
        ...subPlan,
        id: subPlanId,
        nodes: sortPathNodes(subPlan.nodes).map((node) => ({
          ...node,
          subPlanId,
        })),
        edges: sortPathEdgesByOrder(subPlan.nodes, subPlan.edges).map(
          (edge) => ({
            ...edge,
            subPlanId,
          })
        ),
      }
    }),
    createdAt: persistedRoute?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
}

function makeRouteNode(
  routeId: string,
  input: PathNodeCreateInput,
  order: number
): RouteNode {
  return {
    id: input.id ?? draftId("node"),
    routeId,
    name: input.name,
    lat: input.lat,
    lng: input.lng,
    order,
    category: input.category,
    durationMinutes: input.durationMinutes,
    notes: input.notes,
  }
}

function makeSubPlanNode(
  subPlanId: string,
  input: PathNodeCreateInput,
  order: number
): SubPlanNode {
  return {
    id: input.id ?? draftId("subplan-node"),
    subPlanId,
    name: input.name,
    lat: input.lat,
    lng: input.lng,
    order,
    category: input.category,
    durationMinutes: input.durationMinutes,
    notes: input.notes,
  }
}

function makeRouteEdge(
  routeId: string,
  fromNodeId: string,
  toNodeId: string,
  input: PathEdgeCreateInput
): RouteEdge {
  return {
    id: input.id ?? draftId("edge"),
    routeId,
    fromNodeId,
    toNodeId,
    status: input.status,
    transportMode: input.transportMode,
    durationMinutes: input.durationMinutes,
    distanceKm: input.distanceKm,
    costEstimate: input.costEstimate,
    notes: input.notes,
  }
}

function makeSubPlanEdge(
  subPlanId: string,
  fromNodeId: string,
  toNodeId: string,
  input: PathEdgeCreateInput
): SubPlanEdge {
  return {
    id: input.id ?? draftId("subplan-edge"),
    subPlanId,
    fromNodeId,
    toNodeId,
    status: input.status,
    transportMode: input.transportMode,
    durationMinutes: input.durationMinutes,
    distanceKm: input.distanceKm,
    costEstimate: input.costEstimate,
    notes: input.notes,
  }
}

function applyNodePatch<TNode extends RouteNode | SubPlanNode>(
  node: TNode,
  patch: PathNodePatchInput
): TNode {
  return {
    ...node,
    ...patch,
    durationMinutes:
      patch.durationMinutes === null
        ? undefined
        : (patch.durationMinutes ?? node.durationMinutes),
    notes: patch.notes === null ? undefined : (patch.notes ?? node.notes),
  }
}

function applyEdgePatch<TEdge extends RouteEdge | SubPlanEdge>(
  edge: TEdge,
  patch: PathEdgePatchInput
): TEdge {
  return {
    ...edge,
    ...patch,
    transportMode:
      patch.transportMode === null
        ? undefined
        : (patch.transportMode ?? edge.transportMode),
    durationMinutes:
      patch.durationMinutes === null
        ? undefined
        : (patch.durationMinutes ?? edge.durationMinutes),
    distanceKm:
      patch.distanceKm === null
        ? undefined
        : (patch.distanceKm ?? edge.distanceKm),
    costEstimate:
      patch.costEstimate === null
        ? undefined
        : (patch.costEstimate ?? edge.costEstimate),
    notes: patch.notes === null ? undefined : (patch.notes ?? edge.notes),
  }
}

function findRouteEdge(route: Route, input: UpdateEdgeInput) {
  return route.edges.find((edge) => {
    if (input.edgeId) return edge.id === input.edgeId
    return (
      edge.fromNodeId === input.fromNodeId && edge.toNodeId === input.toNodeId
    )
  })
}

function findSubPlanEdge(subPlan: SubPlan, input: SubPlanUpdateEdgeInput) {
  return subPlan.edges.find((edge) => {
    if (input.edgeId) return edge.id === input.edgeId
    return (
      edge.fromNodeId === input.fromNodeId && edge.toNodeId === input.toNodeId
    )
  })
}

function normalizeRouteNodeOrders(nodes: RouteNode[]) {
  return sortPathNodes(nodes).map((node, order) => ({ ...node, order }))
}

function normalizeSubPlanNodeOrders(nodes: SubPlanNode[]) {
  return sortPathNodes(nodes).map((node, order) => ({ ...node, order }))
}

export class DraftStore {
  private readonly sessions = new Map<string, SessionDraft>()

  getSnapshot(sessionId: string): DraftSnapshot {
    const session = this.ensureSession(sessionId)
    return {
      sessionId,
      route: session.route ? cloneRoute(session.route) : null,
      sourceRouteId: session.sourceRouteId,
      isLocked: Boolean(session.lockedByRunId),
      lockedByRunId: session.lockedByRunId,
      revision: session.revision,
      pendingSuggestions: pendingSuggestionSummaries(session),
      updatedAt: session.updatedAt,
    }
  }

  bindSessionContext(sessionId: string, context: AuthContext) {
    const session = this.ensureSession(sessionId)
    session.userContext = context
    session.updatedAt = nowIso()
    return this.getSnapshot(sessionId)
  }

  getSessionContext(sessionId: string) {
    return this.ensureSession(sessionId).userContext
  }

  getConversationMessages(sessionId: string) {
    return this.ensureSession(sessionId).conversationMessages.map(
      (message) => ({ ...message })
    )
  }

  addUserConversationMessage(sessionId: string, content: string) {
    return this.addConversationMessage(sessionId, {
      role: "user",
      content,
      runId: null,
    })
  }

  appendAssistantConversationDelta(
    sessionId: string,
    runId: string,
    content: string
  ) {
    const session = this.ensureSession(sessionId)
    const lastMessage = session.conversationMessages.at(-1)
    const timestamp = nowIso()

    if (lastMessage?.role === "assistant" && lastMessage.runId === runId) {
      lastMessage.content += content
      lastMessage.updatedAt = timestamp
      session.updatedAt = timestamp
      return { ...lastMessage }
    }

    return this.addConversationMessage(sessionId, {
      role: "assistant",
      content,
      runId,
    })
  }

  isLocked(sessionId: string) {
    return Boolean(this.ensureSession(sessionId).lockedByRunId)
  }

  lock(sessionId: string, runId: string) {
    const session = this.ensureSession(sessionId)
    session.lockedByRunId = runId
    session.updatedAt = nowIso()
    return this.getSnapshot(sessionId)
  }

  unlock(sessionId: string, runId: string) {
    const session = this.ensureSession(sessionId)
    if (session.lockedByRunId === runId) {
      session.lockedByRunId = null
      session.updatedAt = nowIso()
    }
    return this.getSnapshot(sessionId)
  }

  async loadSavedRoute(
    context: AuthContext,
    sessionId: string,
    routeId: string
  ) {
    const route = await getRoute(context, routeId)
    if (!route) throw new DraftInputError("Route not found")

    const session = this.ensureSession(sessionId)
    session.route = toDraftRoute(route)
    session.sourceRouteId = route.id
    this.touchSession(session)
    return this.getSnapshot(sessionId)
  }

  replaceDraft(sessionId: string, route: RouteInput | Route | null) {
    const session = this.ensureSession(sessionId)
    session.route = route ? toDraftRoute(route) : null
    session.sourceRouteId =
      route &&
      isPersistedRoute(route) &&
      !route.id.startsWith("draft-") &&
      !route.id.startsWith("preset-") &&
      !route.id.startsWith("temp-")
        ? route.id
        : null
    this.touchSession(session)
    return this.getSnapshot(sessionId)
  }

  createSuggestion(
    sessionId: string,
    input: ToolCallSuggestionCreateInput
  ) {
    const session = this.ensureSession(sessionId)
    if (!input.toolCalls.length) {
      throw new DraftInputError("Suggestion must contain at least one tool call")
    }

    const timestamp = nowIso()
    session.pendingSuggestions = [
      {
        id: `suggestion-${randomUUID()}`,
        title: input.title.trim() || "路线修改建议",
        summary: input.summary.trim() || "Agent 生成了一组待确认的路线修改",
        toolCalls: cloneSuggestionToolCalls(input.toolCalls),
        draftRevision: session.revision,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      ...session.pendingSuggestions,
    ].slice(0, 8)
    session.updatedAt = timestamp
    return this.getSnapshot(sessionId)
  }

  rejectSuggestion(sessionId: string, suggestionId: string) {
    const session = this.ensureSession(sessionId)
    session.pendingSuggestions = session.pendingSuggestions.filter(
      (suggestion) => suggestion.id !== suggestionId
    )
    session.updatedAt = nowIso()
    return this.getSnapshot(sessionId)
  }

  async acceptSuggestion(sessionId: string, suggestionId: string) {
    const session = this.ensureSession(sessionId)
    const suggestion = session.pendingSuggestions.find(
      (candidate) => candidate.id === suggestionId
    )
    if (!suggestion) throw new DraftInputError("Suggestion not found")
    if (suggestion.draftRevision !== session.revision) {
      throw new DraftInputError("Suggestion is stale; regenerate it first")
    }

    const previewSessionId = `suggestion-preview-${randomUUID()}`
    this.sessions.set(previewSessionId, {
      sessionId: previewSessionId,
      userContext: session.userContext,
      route: session.route ? cloneRoute(session.route) : null,
      sourceRouteId: session.sourceRouteId,
      lockedByRunId: null,
      conversationMessages: clone(session.conversationMessages),
      pendingSuggestions: [],
      revision: session.revision,
      updatedAt: session.updatedAt,
    })

    try {
      for (const toolCall of suggestion.toolCalls) {
        await this.callTool(previewSessionId, toolCall.tool, toolCall.input)
      }
      const previewSession = this.ensureSession(previewSessionId)
      session.route = previewSession.route ? cloneRoute(previewSession.route) : null
      session.sourceRouteId = previewSession.sourceRouteId
      session.pendingSuggestions = session.pendingSuggestions.filter(
        (candidate) => candidate.id !== suggestionId
      )
      this.touchSession(session)
      return this.getSnapshot(sessionId)
    } finally {
      this.sessions.delete(previewSessionId)
    }
  }

  routeAddStartNode(sessionId: string, input: RouteAddStartNodeInput) {
    const session = this.ensureSession(sessionId)
    if (session.route && session.route.nodes.length > 0) {
      throw new DraftInputError("Draft route already has a start node")
    }

    const timestamp = nowIso()
    const routeId = session.route?.id ?? draftId("route")
    const route: Route = {
      id: routeId,
      ownerId: session.route?.ownerId ?? "draft-owner",
      name: input.route?.name?.trim() || session.route?.name || "未命名路线",
      description: input.route?.description ?? session.route?.description,
      nodes: [makeRouteNode(routeId, input.node, 0)],
      edges: [],
      subPlans: [],
      createdAt: session.route?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }

    return this.commitRoute(sessionId, route)
  }

  routeAppendNode(sessionId: string, input: AppendNodeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneRoute(session.route)
    const plan = planAppendNode(route.nodes)
    if (!plan.previousNode) {
      throw new DraftInputError("Use route.add_start_node for an empty route")
    }

    const node = makeRouteNode(route.id, input.node, plan.order)
    route.nodes = [...route.nodes, node]
    route.edges = [
      ...route.edges,
      makeRouteEdge(route.id, plan.previousNode.id, node.id, input.edge),
    ]
    return this.commitRoute(sessionId, route)
  }

  routeInsertNode(sessionId: string, input: InsertNodeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneRoute(session.route)
    const planResult = planInsertNodeBefore(
      route.nodes,
      input.beforeNodeId,
      "route path graph"
    )
    if (!planResult.ok) throw new DraftInputError(planResult.error)

    const plan = planResult.plan
    if (plan.previousNode && !input.beforeEdge) {
      throw new DraftInputError("beforeEdge is required for middle insertion")
    }

    const node = makeRouteNode(route.id, input.node, plan.order)
    const oldEdgeIds = new Set(
      route.edges
        .filter(
          (edge) =>
            edge.fromNodeId === plan.previousNode?.id &&
            edge.toNodeId === plan.nextNode?.id
        )
        .map((edge) => edge.id)
    )

    route.nodes = route.nodes.map((existingNode) => {
      const update = plan.orderUpdates.find(
        (orderUpdate) => orderUpdate.nodeId === existingNode.id
      )
      return update ? { ...existingNode, order: update.order } : existingNode
    })
    route.nodes.push(node)
    route.edges = route.edges.filter((edge) => !oldEdgeIds.has(edge.id))
    if (plan.previousNode && input.beforeEdge) {
      route.edges.push(
        makeRouteEdge(route.id, plan.previousNode.id, node.id, input.beforeEdge)
      )
    }
    if (!plan.nextNode) {
      throw new DraftInputError("Insert target node is missing")
    }
    route.edges.push(
      makeRouteEdge(route.id, node.id, plan.nextNode.id, input.afterEdge)
    )

    return this.commitRoute(sessionId, route)
  }

  routeRemoveNodeRange(sessionId: string, input: RemoveNodeRangeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneRoute(session.route)
    const planResult = planRemoveNodeRange(
      { nodes: route.nodes, edges: route.edges },
      input.startNodeId,
      input.endNodeId,
      "route path graph"
    )
    if (!planResult.ok) throw new DraftInputError(planResult.error)

    const plan = planResult.plan
    if (plan.requiresBridgeEdge && !input.bridgeEdge) {
      throw new DraftInputError("bridgeEdge is required for middle deletion")
    }

    const removedNodeIds = new Set(plan.nodesToRemove.map((node) => node.id))
    const removedEdgeIds = new Set(plan.edgesToRemove.map((edge) => edge.id))
    route.nodes = normalizeRouteNodeOrders(
      route.nodes.filter((node) => !removedNodeIds.has(node.id))
    )
    route.edges = route.edges.filter((edge) => !removedEdgeIds.has(edge.id))
    route.subPlans = route.subPlans.filter(
      (subPlan) => !removedNodeIds.has(subPlan.routeNodeId)
    )

    if (
      plan.requiresBridgeEdge &&
      plan.bridgeFromNode &&
      plan.bridgeToNode &&
      input.bridgeEdge
    ) {
      route.edges.push(
        makeRouteEdge(
          route.id,
          plan.bridgeFromNode.id,
          plan.bridgeToNode.id,
          input.bridgeEdge
        )
      )
    }

    return this.commitRoute(sessionId, route)
  }

  routeUpdateNode(sessionId: string, input: UpdateNodeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneRoute(session.route)
    if (!route.nodes.some((node) => node.id === input.nodeId)) {
      throw new DraftInputError("Route node not found")
    }
    route.nodes = route.nodes.map((node) =>
      node.id === input.nodeId ? applyNodePatch(node, input.patch) : node
    )
    return this.commitRoute(sessionId, route)
  }

  routeUpdateEdge(sessionId: string, input: UpdateEdgeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneRoute(session.route)
    const edge = findRouteEdge(route, input)
    if (!edge) throw new DraftInputError("Route edge not found")
    route.edges = route.edges.map((candidate) =>
      candidate.id === edge.id ? applyEdgePatch(candidate, input.patch) : candidate
    )
    return this.commitRoute(sessionId, route)
  }

  subPlanCreate(sessionId: string, input: SubPlanCreateInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneRoute(session.route)
    if (!route.nodes.some((node) => node.id === input.routeNodeId)) {
      throw new DraftInputError("Route node not found")
    }
    if (route.subPlans.some((subPlan) => subPlan.routeNodeId === input.routeNodeId)) {
      throw new DraftInputError("SubPlan already exists for route node")
    }

    const subPlanId = input.subPlan?.id ?? draftId("subplan")
    const subPlan: SubPlan = {
      id: subPlanId,
      routeNodeId: input.routeNodeId,
      nodes: (input.subPlan?.nodes ?? []).map((node, order) =>
        makeSubPlanNode(subPlanId, node, node.order ?? order)
      ),
      edges: (input.subPlan?.edges ?? []).map((edge) => {
        if (!edge.fromNodeId || !edge.toNodeId) {
          throw new DraftInputError(
            "SubPlan replacement edges require endpoints"
          )
        }
        return makeSubPlanEdge(
          subPlanId,
          edge.fromNodeId,
          edge.toNodeId,
          edge
        )
      }),
    }
    route.subPlans = [...route.subPlans, subPlan]
    return this.commitRoute(sessionId, route)
  }

  subPlanAddStartNode(sessionId: string, input: SubPlanNodeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneRoute(session.route)
    const subPlan = this.mutableSubPlan(route, input.routeNodeId)
    if (subPlan.nodes.length > 0) {
      throw new DraftInputError("SubPlan already has a start node")
    }
    subPlan.nodes = [makeSubPlanNode(subPlan.id, input.node, 0)]
    return this.commitRoute(sessionId, route)
  }

  subPlanAppendNode(sessionId: string, input: SubPlanNodeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneRoute(session.route)
    const subPlan = this.mutableSubPlan(route, input.routeNodeId)
    const plan = planAppendNode(subPlan.nodes)
    if (!plan.previousNode) {
      throw new DraftInputError("Use subplan.add_start_node for an empty subplan")
    }
    const node = makeSubPlanNode(subPlan.id, input.node, plan.order)
    subPlan.nodes = [...subPlan.nodes, node]
    subPlan.edges = [
      ...subPlan.edges,
      makeSubPlanEdge(subPlan.id, plan.previousNode.id, node.id, input.edge),
    ]
    return this.commitRoute(sessionId, route)
  }

  subPlanInsertNode(sessionId: string, input: SubPlanInsertNodeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneRoute(session.route)
    const subPlan = this.mutableSubPlan(route, input.routeNodeId)
    const planResult = planInsertNodeBefore(
      subPlan.nodes,
      input.beforeNodeId,
      "subplan path graph"
    )
    if (!planResult.ok) throw new DraftInputError(planResult.error)
    const plan = planResult.plan
    if (plan.previousNode && !input.beforeEdge) {
      throw new DraftInputError("beforeEdge is required for middle insertion")
    }
    if (!plan.nextNode) {
      throw new DraftInputError("Insert target node is missing")
    }

    const node = makeSubPlanNode(subPlan.id, input.node, plan.order)
    const oldEdgeIds = new Set(
      subPlan.edges
        .filter(
          (edge) =>
            edge.fromNodeId === plan.previousNode?.id &&
            edge.toNodeId === plan.nextNode?.id
        )
        .map((edge) => edge.id)
    )
    subPlan.nodes = subPlan.nodes.map((existingNode) => {
      const update = plan.orderUpdates.find(
        (orderUpdate) => orderUpdate.nodeId === existingNode.id
      )
      return update ? { ...existingNode, order: update.order } : existingNode
    })
    subPlan.nodes.push(node)
    subPlan.edges = subPlan.edges.filter((edge) => !oldEdgeIds.has(edge.id))
    if (plan.previousNode && input.beforeEdge) {
      subPlan.edges.push(
        makeSubPlanEdge(
          subPlan.id,
          plan.previousNode.id,
          node.id,
          input.beforeEdge
        )
      )
    }
    subPlan.edges.push(
      makeSubPlanEdge(subPlan.id, node.id, plan.nextNode.id, input.afterEdge)
    )
    return this.commitRoute(sessionId, route)
  }

  subPlanRemoveNodeRange(
    sessionId: string,
    input: SubPlanRemoveNodeRangeInput
  ) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneRoute(session.route)
    const subPlan = this.mutableSubPlan(route, input.routeNodeId)
    const planResult = planRemoveNodeRange(
      { nodes: subPlan.nodes, edges: subPlan.edges },
      input.startNodeId,
      input.endNodeId,
      "subplan path graph"
    )
    if (!planResult.ok) throw new DraftInputError(planResult.error)
    const plan = planResult.plan
    if (plan.requiresBridgeEdge && !input.bridgeEdge) {
      throw new DraftInputError("bridgeEdge is required for middle deletion")
    }

    const removedNodeIds = new Set(plan.nodesToRemove.map((node) => node.id))
    const removedEdgeIds = new Set(plan.edgesToRemove.map((edge) => edge.id))
    subPlan.nodes = normalizeSubPlanNodeOrders(
      subPlan.nodes.filter((node) => !removedNodeIds.has(node.id))
    )
    subPlan.edges = subPlan.edges.filter((edge) => !removedEdgeIds.has(edge.id))
    if (
      plan.requiresBridgeEdge &&
      plan.bridgeFromNode &&
      plan.bridgeToNode &&
      input.bridgeEdge
    ) {
      subPlan.edges.push(
        makeSubPlanEdge(
          subPlan.id,
          plan.bridgeFromNode.id,
          plan.bridgeToNode.id,
          input.bridgeEdge
        )
      )
    }
    return this.commitRoute(sessionId, route)
  }

  subPlanUpdateNode(sessionId: string, input: SubPlanUpdateNodeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneRoute(session.route)
    const subPlan = this.mutableSubPlan(route, input.routeNodeId)
    if (!subPlan.nodes.some((node) => node.id === input.nodeId)) {
      throw new DraftInputError("SubPlan node not found")
    }
    subPlan.nodes = subPlan.nodes.map((node) =>
      node.id === input.nodeId ? applyNodePatch(node, input.patch) : node
    )
    return this.commitRoute(sessionId, route)
  }

  subPlanUpdateEdge(sessionId: string, input: SubPlanUpdateEdgeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneRoute(session.route)
    const subPlan = this.mutableSubPlan(route, input.routeNodeId)
    const edge = findSubPlanEdge(subPlan, input)
    if (!edge) throw new DraftInputError("SubPlan edge not found")
    subPlan.edges = subPlan.edges.map((candidate) =>
      candidate.id === edge.id ? applyEdgePatch(candidate, input.patch) : candidate
    )
    return this.commitRoute(sessionId, route)
  }

  async saveDraft(context: AuthContext, sessionId: string) {
    const session = this.ensureRouteSession(sessionId)
    const routeInput = toRouteInput(session.route)
    const savedRoute = session.sourceRouteId
      ? await updateRoute(context, session.sourceRouteId, routeInput)
      : await createRoute(context, routeInput)

    if (!savedRoute) throw new DraftInputError("Route not found")

    session.route = toDraftRoute(savedRoute)
    session.sourceRouteId = savedRoute.id
    this.touchSession(session)
    return this.getSnapshot(sessionId)
  }

  async callTool(
    sessionId: string,
    tool: DraftToolName,
    input: Record<string, unknown>
  ) {
    if (tool === "get_current_draft") return this.getSnapshot(sessionId)
    if (tool === "replace_draft") {
      return this.replaceDraft(
        sessionId,
        input.route as RouteInput | Route | null
      )
    }
    if (tool === "route.add_start_node") {
      return this.routeAddStartNode(sessionId, input as never)
    }
    if (tool === "route.append_node") {
      return this.routeAppendNode(sessionId, input as never)
    }
    if (tool === "route.insert_node") {
      return this.routeInsertNode(sessionId, input as never)
    }
    if (tool === "route.remove_node_range") {
      return this.routeRemoveNodeRange(sessionId, input as never)
    }
    if (tool === "route.update_node") {
      return this.routeUpdateNode(sessionId, input as never)
    }
    if (tool === "route.update_edge") {
      return this.routeUpdateEdge(sessionId, input as never)
    }
    if (tool === "subplan.create") {
      return this.subPlanCreate(sessionId, input as never)
    }
    if (tool === "subplan.add_start_node") {
      return this.subPlanAddStartNode(sessionId, input as never)
    }
    if (tool === "subplan.append_node") {
      return this.subPlanAppendNode(sessionId, input as never)
    }
    if (tool === "subplan.insert_node") {
      return this.subPlanInsertNode(sessionId, input as never)
    }
    if (tool === "subplan.remove_node_range") {
      return this.subPlanRemoveNodeRange(sessionId, input as never)
    }
    if (tool === "subplan.update_node") {
      return this.subPlanUpdateNode(sessionId, input as never)
    }
    return this.subPlanUpdateEdge(sessionId, input as never)
  }

  private mutableSubPlan(route: Route, routeNodeId: string) {
    const subPlan = route.subPlans.find(
      (candidate) => candidate.routeNodeId === routeNodeId
    )
    if (!subPlan) throw new DraftInputError("SubPlan not found")
    return subPlan
  }

  private commitRoute(sessionId: string, route: Route) {
    const session = this.ensureSession(sessionId)
    const timestamp = nowIso()
    const nextRoute = { ...route, updatedAt: timestamp }
    validatedDraftRoute(toRouteInput(nextRoute))
    session.route = nextRoute
    this.touchSession(session)
    return this.getSnapshot(sessionId)
  }

  private ensureRouteSession(sessionId: string) {
    const session = this.ensureSession(sessionId)
    if (!session.route) throw new DraftInputError("Draft route is empty")
    return session as SessionDraft & { route: Route }
  }

  private touchSession(session: SessionDraft) {
    session.revision += 1
    session.updatedAt = nowIso()
    session.pendingSuggestions = session.pendingSuggestions.filter(
      (suggestion) => suggestion.draftRevision === session.revision
    )
  }

  private ensureSession(sessionId: string) {
    const existing = this.sessions.get(sessionId)
    if (existing) return existing

    const session: SessionDraft = {
      sessionId,
      userContext: null,
      route: null,
      sourceRouteId: null,
      lockedByRunId: null,
      conversationMessages: [],
      pendingSuggestions: [],
      revision: 0,
      updatedAt: nowIso(),
    }
    this.sessions.set(sessionId, session)
    return session
  }

  private addConversationMessage(
    sessionId: string,
    input: Pick<AgentConversationMessage, "role" | "content" | "runId">
  ) {
    const session = this.ensureSession(sessionId)
    const timestamp = nowIso()
    const message: AgentConversationMessage = {
      id: `message-${randomUUID()}`,
      role: input.role,
      content: input.content,
      runId: input.runId,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    session.conversationMessages.push(message)
    session.updatedAt = timestamp
    return { ...message }
  }
}
