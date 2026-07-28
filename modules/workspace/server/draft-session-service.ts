import { randomUUID } from "node:crypto"
import type { AuthContext } from "@/modules/auth/server/context"
import {
  planAppendNode,
  planInsertNodeBefore,
  planRemoveNodeRange,
  sortPathNodes,
  sortPathEdgesByOrder,
} from "@/lib/routes/path-graph"
import { validateDraftRouteInput } from "@/lib/routes/validation"
import {
  applyRoutePlanBundle,
  buildRoutePlanRequest,
  mergeWorkspaceRoutePlans,
  routePlanFingerprint,
  selectedRoutePlan,
  type RoutePlanBundle,
  type RoutePlanRequest,
} from "@/lib/routes/planning"
import type {
  DraftRoute,
  PathEdgeCreateInput,
  PathEdgePatchInput,
  PathNodeCreateInput,
  PathNodePatchInput,
  NodeCategory,
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
  LinkPlaceToNodeInput,
  PlanEdgeInput,
  RemoveNodeRangeInput,
  SelectRoutePlanInput,
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
} from "./contracts"

export class DraftInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DraftInputError"
  }
}

interface RoutePlanningPort {
  plan(request: RoutePlanRequest): Promise<RoutePlanBundle>
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

function cloneDocument(document: DraftRoute): DraftRoute {
  return clone(document)
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

function toRouteInput(route: DraftRoute): RouteInput {
  return {
    id: route.id,
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

function toDraftRoute(input: RouteInput | Route): DraftRoute {
  const data = validatedDraftRoute(input)
  const persistedRoute = isPersistedRoute(input) ? input : null
  const routeId = data.id ?? persistedRoute?.id ?? draftId("route")

  return {
    id: routeId,
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
    placeId: input.placeId,
    coordinateSystem: input.coordinateSystem,
    coordinateProvider: input.coordinateProvider,
    providerPlaceId: input.providerPlaceId,
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
    placeId: input.placeId,
    coordinateSystem: input.coordinateSystem,
    coordinateProvider: input.coordinateProvider,
    providerPlaceId: input.providerPlaceId,
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
    requestMode: input.requestMode,
    departAt: input.departAt,
    preference: input.preference,
    planningStatus: "EMPTY",
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
    requestMode: input.requestMode,
    departAt: input.departAt,
    preference: input.preference,
    planningStatus: "EMPTY",
  }
}

function applyNodePatch<TNode extends RouteNode | SubPlanNode>(
  node: TNode,
  patch: PathNodePatchInput
): TNode {
  return {
    ...node,
    ...patch,
    placeId:
      patch.placeId === null ? undefined : (patch.placeId ?? node.placeId),
    coordinateSystem:
      patch.coordinateSystem === null
        ? undefined
        : (patch.coordinateSystem ?? node.coordinateSystem),
    coordinateProvider:
      patch.coordinateProvider === null
        ? undefined
        : (patch.coordinateProvider ?? node.coordinateProvider),
    providerPlaceId:
      patch.providerPlaceId === null
        ? undefined
        : (patch.providerPlaceId ?? node.providerPlaceId),
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
  const requestChanged =
    patch.transportMode !== undefined ||
    patch.requestMode !== undefined ||
    patch.departAt !== undefined ||
    patch.preference !== undefined
  const next = {
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
    requestMode:
      patch.requestMode === null
        ? undefined
        : (patch.requestMode ?? edge.requestMode),
    departAt:
      patch.departAt === null ? undefined : (patch.departAt ?? edge.departAt),
    preference:
      patch.preference === null
        ? undefined
        : (patch.preference ?? edge.preference),
    selectedPlanId:
      patch.selectedPlanId === null
        ? undefined
        : (patch.selectedPlanId ?? edge.selectedPlanId),
  }
  return requestChanged ? staleEdgePlan(next) : next
}

function staleEdgePlan<TEdge extends RouteEdge | SubPlanEdge>(
  edge: TEdge
): TEdge {
  return {
    ...edge,
    planningStatus: edge.plans?.length ? "STALE" : "EMPTY",
    planningWarning: undefined,
  }
}

function findRouteEdge(route: DraftRoute, input: UpdateEdgeInput) {
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

function mapPlaceCategoryToNodeCategory(
  category: string | undefined
): NodeCategory | undefined {
  if (!category) return undefined
  if (category === "RESTAURANT") return "RESTAURANT"
  if (category === "HOTEL") return "HOTEL"
  if (category === "TRANSIT") return "TRANSIT"
  if (
    category === "SIGHT" ||
    category === "PARK" ||
    category === "MUSEUM" ||
    category === "CULTURE"
  ) {
    return "SIGHT"
  }
  if (
    category === "PERFORMANCE" ||
    category === "SPORTS" ||
    category === "ENTERTAINMENT"
  ) {
    return "ACTIVITY"
  }
  return "PLACE"
}

function placeLinkPatch(input: LinkPlaceToNodeInput): PathNodePatchInput {
  return {
    name: input.place.name,
    lat: input.place.coordinate.lat,
    lng: input.place.coordinate.lng,
    placeId: input.place.placeId,
    coordinateSystem: input.place.coordinate.coordinateSystem,
    coordinateProvider: input.place.coordinate.provider,
    providerPlaceId: input.place.providerPlaceId,
    category: mapPlaceCategoryToNodeCategory(input.place.category),
  }
}

export class DraftSessionService {
  private readonly sessions = new Map<string, SessionDraft>()

  constructor(
    private readonly routePlanning: RoutePlanningPort | null = null
  ) {}

  getSnapshot(sessionId: string): DraftSnapshot {
    const session = this.ensureSession(sessionId)
    return {
      sessionId,
      document: session.document ? cloneDocument(session.document) : null,
      sourceRouteId: session.sourceRouteId,
      baseVersion: session.baseVersion,
      dirty: session.dirty,
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

  loadPersistedRoute(sessionId: string, route: Route) {
    const session = this.ensureSession(sessionId)
    session.document = toDraftRoute(route)
    session.sourceRouteId = route.id
    session.baseVersion = route.version
    this.touchSession(session, false)
    session.dirty = false
    return this.getSnapshot(sessionId)
  }

  replaceDraft(sessionId: string, route: RouteInput | Route | null) {
    const session = this.ensureSession(sessionId)
    session.document = route ? toDraftRoute(route) : null
    const sourceRouteId =
      route &&
      isPersistedRoute(route) &&
      !route.id.startsWith("draft-") &&
      !route.id.startsWith("preset-") &&
      !route.id.startsWith("temp-")
        ? route.id
        : null
    session.sourceRouteId = sourceRouteId
    session.baseVersion =
      sourceRouteId && route && isPersistedRoute(route) ? route.version : null
    this.touchSession(session, !sourceRouteId)
    session.dirty = Boolean(route) && !sourceRouteId
    return this.getSnapshot(sessionId)
  }

  getDraftForSave(sessionId: string) {
    const session = this.ensureRouteSession(sessionId)
    return {
      document: cloneDocument(session.document),
      routeInput: toRouteInput(session.document),
      sourceRouteId: session.sourceRouteId,
      baseVersion: session.baseVersion,
    }
  }

  markDraftSaved(
    sessionId: string,
    persistedRoute: Route,
    preserveRoutePlans = false
  ) {
    const session = this.ensureSession(sessionId)
    const persistedDocument = toDraftRoute(persistedRoute)
    session.document =
      preserveRoutePlans && session.document
        ? mergeWorkspaceRoutePlans(session.document, persistedDocument)
        : persistedDocument
    session.sourceRouteId = persistedRoute.id
    session.baseVersion = persistedRoute.version
    this.touchSession(session, false)
    session.dirty = false
    return this.getSnapshot(sessionId)
  }

  createSuggestion(sessionId: string, input: ToolCallSuggestionCreateInput) {
    const session = this.ensureSession(sessionId)
    if (!input.toolCalls.length) {
      throw new DraftInputError(
        "Suggestion must contain at least one tool call"
      )
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
      document: session.document ? cloneDocument(session.document) : null,
      sourceRouteId: session.sourceRouteId,
      baseVersion: session.baseVersion,
      dirty: session.dirty,
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
      session.document = previewSession.document
        ? cloneDocument(previewSession.document)
        : null
      session.sourceRouteId = previewSession.sourceRouteId
      session.baseVersion = previewSession.baseVersion
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
    if (session.document && session.document.nodes.length > 0) {
      throw new DraftInputError("Draft route already has a start node")
    }

    const routeId = session.document?.id ?? draftId("route")
    const route: DraftRoute = {
      id: routeId,
      name: input.route?.name?.trim() || session.document?.name || "未命名路线",
      description: input.route?.description ?? session.document?.description,
      nodes: [makeRouteNode(routeId, input.node, 0)],
      edges: [],
      subPlans: [],
    }

    return this.commitRoute(sessionId, route)
  }

  routeAppendNode(sessionId: string, input: AppendNodeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneDocument(session.document)
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
    const route = cloneDocument(session.document)
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
    const route = cloneDocument(session.document)
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
    const route = cloneDocument(session.document)
    if (!route.nodes.some((node) => node.id === input.nodeId)) {
      throw new DraftInputError("Route node not found")
    }
    route.nodes = route.nodes.map((node) =>
      node.id === input.nodeId ? applyNodePatch(node, input.patch) : node
    )
    route.edges = route.edges.map((edge) =>
      edge.fromNodeId === input.nodeId || edge.toNodeId === input.nodeId
        ? staleEdgePlan(edge)
        : edge
    )
    return this.commitRoute(sessionId, route)
  }

  routeLinkPlaceToNode(sessionId: string, input: LinkPlaceToNodeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneDocument(session.document)
    const patch = placeLinkPatch(input)

    if (input.routeNodeId) {
      const subPlan = this.mutableSubPlan(route, input.routeNodeId)
      if (!subPlan.nodes.some((node) => node.id === input.nodeId)) {
        throw new DraftInputError("SubPlan node not found")
      }
      subPlan.nodes = subPlan.nodes.map((node) =>
        node.id === input.nodeId ? applyNodePatch(node, patch) : node
      )
      subPlan.edges = subPlan.edges.map((edge) =>
        edge.fromNodeId === input.nodeId || edge.toNodeId === input.nodeId
          ? staleEdgePlan(edge)
          : edge
      )
      return this.commitRoute(sessionId, route)
    }

    if (!route.nodes.some((node) => node.id === input.nodeId)) {
      throw new DraftInputError("Route node not found")
    }
    route.nodes = route.nodes.map((node) =>
      node.id === input.nodeId ? applyNodePatch(node, patch) : node
    )
    route.edges = route.edges.map((edge) =>
      edge.fromNodeId === input.nodeId || edge.toNodeId === input.nodeId
        ? staleEdgePlan(edge)
        : edge
    )
    return this.commitRoute(sessionId, route)
  }

  routeUpdateEdge(sessionId: string, input: UpdateEdgeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneDocument(session.document)
    const edge = findRouteEdge(route, input)
    if (!edge) throw new DraftInputError("Route edge not found")
    route.edges = route.edges.map((candidate) =>
      candidate.id === edge.id
        ? applyEdgePatch(candidate, input.patch)
        : candidate
    )
    return this.commitRoute(sessionId, route)
  }

  async routePlanEdge(sessionId: string, input: PlanEdgeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneDocument(session.document)
    const path = input.routeNodeId
      ? this.mutableSubPlan(route, input.routeNodeId)
      : route
    const edge = path.edges.find((candidate) => candidate.id === input.edgeId)
    if (!edge) throw new DraftInputError("Route edge not found")
    const nodeById = new Map(path.nodes.map((node) => [node.id, node]))
    const from = nodeById.get(edge.fromNodeId)
    const to = nodeById.get(edge.toNodeId)
    if (!from || !to)
      throw new DraftInputError("Route edge endpoints not found")
    const request = buildRoutePlanRequest(edge, from, to)
    if (!request) {
      throw new DraftInputError("Route edge transport mode is not plannable")
    }
    if (!this.routePlanning) {
      throw new DraftInputError("Route planning service is unavailable")
    }
    const expectedFingerprint = routePlanFingerprint(request)
    const bundle = await this.routePlanning.plan(request)
    const current = this.ensureRouteSession(sessionId)
    const currentPath = input.routeNodeId
      ? this.mutableSubPlan(current.document, input.routeNodeId)
      : current.document
    const currentEdge = currentPath.edges.find(
      (candidate) => candidate.id === input.edgeId
    )
    const currentNodeById = new Map(
      currentPath.nodes.map((node) => [node.id, node])
    )
    const currentFrom = currentEdge
      ? currentNodeById.get(currentEdge.fromNodeId)
      : undefined
    const currentTo = currentEdge
      ? currentNodeById.get(currentEdge.toNodeId)
      : undefined
    const currentRequest =
      currentEdge && currentFrom && currentTo
        ? buildRoutePlanRequest(currentEdge, currentFrom, currentTo)
        : null
    if (
      !currentEdge ||
      !currentRequest ||
      routePlanFingerprint(currentRequest) !== expectedFingerprint
    ) {
      return this.getSnapshot(sessionId)
    }
    currentPath.edges = currentPath.edges.map((candidate) =>
      candidate.id === currentEdge.id
        ? applyRoutePlanBundle(candidate, bundle)
        : candidate
    )
    return this.commitRoute(sessionId, current.document)
  }

  routeSelectPlan(sessionId: string, input: SelectRoutePlanInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneDocument(session.document)
    const path = input.routeNodeId
      ? this.mutableSubPlan(route, input.routeNodeId)
      : route
    const edge = path.edges.find((candidate) => candidate.id === input.edgeId)
    if (!edge?.plans?.some((plan) => plan.id === input.planId)) {
      throw new DraftInputError("Route plan not found")
    }
    path.edges = path.edges.map((candidate) => {
      if (candidate.id !== edge.id) return candidate
      const next = { ...candidate, selectedPlanId: input.planId }
      const selected = selectedRoutePlan(next)
      return {
        ...next,
        durationMinutes: selected
          ? Math.max(1, Math.round(selected.durationSeconds / 60))
          : candidate.durationMinutes,
        distanceKm: selected
          ? Math.round((selected.distanceMeters / 1000) * 10) / 10
          : candidate.distanceKm,
        costEstimate: selected?.fareAmount ?? candidate.costEstimate,
      }
    })
    return this.commitRoute(sessionId, route)
  }

  subPlanCreate(sessionId: string, input: SubPlanCreateInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneDocument(session.document)
    if (!route.nodes.some((node) => node.id === input.routeNodeId)) {
      throw new DraftInputError("Route node not found")
    }
    if (
      route.subPlans.some(
        (subPlan) => subPlan.routeNodeId === input.routeNodeId
      )
    ) {
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
        return makeSubPlanEdge(subPlanId, edge.fromNodeId, edge.toNodeId, edge)
      }),
    }
    route.subPlans = [...route.subPlans, subPlan]
    return this.commitRoute(sessionId, route)
  }

  subPlanAddStartNode(sessionId: string, input: SubPlanNodeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneDocument(session.document)
    const subPlan = this.mutableSubPlan(route, input.routeNodeId)
    if (subPlan.nodes.length > 0) {
      throw new DraftInputError("SubPlan already has a start node")
    }
    subPlan.nodes = [makeSubPlanNode(subPlan.id, input.node, 0)]
    return this.commitRoute(sessionId, route)
  }

  subPlanAppendNode(sessionId: string, input: SubPlanNodeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneDocument(session.document)
    const subPlan = this.mutableSubPlan(route, input.routeNodeId)
    const plan = planAppendNode(subPlan.nodes)
    if (!plan.previousNode) {
      throw new DraftInputError(
        "Use subplan.add_start_node for an empty subplan"
      )
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
    const route = cloneDocument(session.document)
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
    const route = cloneDocument(session.document)
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
    const route = cloneDocument(session.document)
    const subPlan = this.mutableSubPlan(route, input.routeNodeId)
    if (!subPlan.nodes.some((node) => node.id === input.nodeId)) {
      throw new DraftInputError("SubPlan node not found")
    }
    subPlan.nodes = subPlan.nodes.map((node) =>
      node.id === input.nodeId ? applyNodePatch(node, input.patch) : node
    )
    subPlan.edges = subPlan.edges.map((edge) =>
      edge.fromNodeId === input.nodeId || edge.toNodeId === input.nodeId
        ? staleEdgePlan(edge)
        : edge
    )
    return this.commitRoute(sessionId, route)
  }

  subPlanUpdateEdge(sessionId: string, input: SubPlanUpdateEdgeInput) {
    const session = this.ensureRouteSession(sessionId)
    const route = cloneDocument(session.document)
    const subPlan = this.mutableSubPlan(route, input.routeNodeId)
    const edge = findSubPlanEdge(subPlan, input)
    if (!edge) throw new DraftInputError("SubPlan edge not found")
    subPlan.edges = subPlan.edges.map((candidate) =>
      candidate.id === edge.id
        ? applyEdgePatch(candidate, input.patch)
        : candidate
    )
    return this.commitRoute(sessionId, route)
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
    if (tool === "route.link_place_to_node") {
      return this.routeLinkPlaceToNode(sessionId, input as never)
    }
    if (tool === "route.plan_edge") {
      return this.routePlanEdge(sessionId, input as never)
    }
    if (tool === "route.select_plan") {
      return this.routeSelectPlan(sessionId, input as never)
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

  private mutableSubPlan(route: DraftRoute, routeNodeId: string) {
    const subPlan = route.subPlans.find(
      (candidate) => candidate.routeNodeId === routeNodeId
    )
    if (!subPlan) throw new DraftInputError("SubPlan not found")
    return subPlan
  }

  private commitRoute(sessionId: string, route: DraftRoute) {
    const session = this.ensureSession(sessionId)
    const nextRoute = { ...route }
    validatedDraftRoute(toRouteInput(nextRoute))
    session.document = nextRoute
    this.touchSession(session)
    return this.getSnapshot(sessionId)
  }

  private ensureRouteSession(sessionId: string) {
    const session = this.ensureSession(sessionId)
    if (!session.document) throw new DraftInputError("Draft route is empty")
    return session as SessionDraft & { document: DraftRoute }
  }

  private touchSession(session: SessionDraft, dirty = true) {
    session.revision += 1
    if (dirty) session.dirty = true
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
      document: null,
      sourceRouteId: null,
      baseVersion: null,
      dirty: false,
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
