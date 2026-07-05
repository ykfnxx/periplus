import type {
  RouteEdgeInput,
  RouteInput,
  RouteNodeInput,
  SubPlanEdgeInput,
  SubPlanInput,
  SubPlanNodeInput,
} from "@/types/route"

export interface PathNodeRef {
  id: string
  order: number
}

export interface PathEdgeRef {
  id: string
  fromNodeId: string
  toNodeId: string
  status: string
  transportMode?: string | null
}

export interface PathGraph<
  TNode extends PathNodeRef = PathNodeRef,
  TEdge extends PathEdgeRef = PathEdgeRef,
> {
  nodes: readonly TNode[]
  edges: readonly TEdge[]
}

export type PathGraphValidationResult =
  | { ok: true }
  | { ok: false; error: string }

export type PathGraphPlanResult<TPlan> =
  | { ok: true; plan: TPlan }
  | { ok: false; error: string }

export interface PathGraphValidationOptions {
  allowEmpty?: boolean
  graphName?: string
}

export interface PathOrderUpdate {
  nodeId: string
  order: number
}

export interface ContinuousNodeRange<TNode extends PathNodeRef> {
  nodes: TNode[]
  startIndex: number
  endIndex: number
  previousNode?: TNode
  nextNode?: TNode
}

export interface AppendNodePlan<TNode extends PathNodeRef> {
  order: number
  previousNode?: TNode
}

export interface InsertNodePlan<TNode extends PathNodeRef> {
  order: number
  previousNode?: TNode
  nextNode?: TNode
  orderUpdates: PathOrderUpdate[]
}

export interface RemoveNodeRangePlan<
  TNode extends PathNodeRef,
  TEdge extends PathEdgeRef,
> {
  range: ContinuousNodeRange<TNode>
  nodesToRemove: TNode[]
  edgesToRemove: TEdge[]
  remainingNodes: TNode[]
  orderUpdates: PathOrderUpdate[]
  bridgeFromNode?: TNode
  bridgeToNode?: TNode
  requiresBridgeEdge: boolean
}

function graphError(
  graphName: string,
  message: string
): PathGraphValidationResult {
  return { ok: false, error: `${graphName}: ${message}` }
}

function graphPlanError<TPlan>(
  graphName: string,
  message: string
): PathGraphPlanResult<TPlan> {
  return { ok: false, error: `${graphName}: ${message}` }
}

export function sortPathNodes<TNode extends PathNodeRef>(
  nodes: readonly TNode[]
): TNode[] {
  return [...nodes].sort((a, b) => a.order - b.order)
}

export function pathNodeIdsInOrder<TNode extends PathNodeRef>(
  nodes: readonly TNode[]
): string[] {
  return sortPathNodes(nodes).map((node) => node.id)
}

export function buildNodeIdMap<TNode extends PathNodeRef>(
  nodes: readonly TNode[]
): Map<string, TNode> {
  return new Map(nodes.map((node) => [node.id, node]))
}

export function sortPathEdgesByOrder<
  TNode extends PathNodeRef,
  TEdge extends PathEdgeRef,
>(nodes: readonly TNode[], edges: readonly TEdge[]): TEdge[] {
  const orderByNodeId = new Map(nodes.map((node) => [node.id, node.order]))
  return [...edges].sort((a, b) => {
    const aOrder = orderByNodeId.get(a.fromNodeId) ?? Number.MAX_SAFE_INTEGER
    const bOrder = orderByNodeId.get(b.fromNodeId) ?? Number.MAX_SAFE_INTEGER
    return aOrder - bOrder
  })
}

export function findOutgoingEdge<TEdge extends PathEdgeRef>(
  edges: readonly TEdge[],
  nodeId: string
): TEdge | undefined {
  return edges.find((edge) => edge.fromNodeId === nodeId)
}

export function findIncomingEdge<TEdge extends PathEdgeRef>(
  edges: readonly TEdge[],
  nodeId: string
): TEdge | undefined {
  return edges.find((edge) => edge.toNodeId === nodeId)
}

export function findContinuousNodeRange<TNode extends PathNodeRef>(
  nodes: readonly TNode[],
  startNodeId: string,
  endNodeId: string
): ContinuousNodeRange<TNode> | null {
  const sortedNodes = sortPathNodes(nodes)
  const startIndex = sortedNodes.findIndex((node) => node.id === startNodeId)
  const endIndex = sortedNodes.findIndex((node) => node.id === endNodeId)

  if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
    return null
  }

  return {
    nodes: sortedNodes.slice(startIndex, endIndex + 1),
    startIndex,
    endIndex,
    previousNode: sortedNodes[startIndex - 1],
    nextNode: sortedNodes[endIndex + 1],
  }
}

export function validatePathGraph<
  TNode extends PathNodeRef,
  TEdge extends PathEdgeRef,
>(
  graph: PathGraph<TNode, TEdge>,
  options: PathGraphValidationOptions = {}
): PathGraphValidationResult {
  const graphName = options.graphName ?? "path graph"
  const sortedNodes = sortPathNodes(graph.nodes)

  if (sortedNodes.length === 0) {
    if (graph.edges.length !== 0) {
      return graphError(
        graphName,
        "edge count must be nodes.length - 1, expected 0"
      )
    }
    if (options.allowEmpty) return { ok: true }
    return graphError(graphName, "at least one node is required")
  }

  const nodeIds = new Set<string>()
  for (const node of sortedNodes) {
    if (node.id.trim().length === 0) {
      return graphError(graphName, "node id is required")
    }
    if (nodeIds.has(node.id)) {
      return graphError(graphName, `duplicate node id ${node.id}`)
    }
    nodeIds.add(node.id)
  }

  for (const [index, node] of sortedNodes.entries()) {
    if (!Number.isInteger(node.order) || node.order !== index) {
      return graphError(graphName, "node orders must be contiguous from 0")
    }
  }

  const expectedEdgeCount = Math.max(sortedNodes.length - 1, 0)
  if (graph.edges.length !== expectedEdgeCount) {
    return graphError(
      graphName,
      `edge count must be nodes.length - 1, expected ${expectedEdgeCount}`
    )
  }

  const edgeIds = new Set<string>()
  const outgoingByNodeId = new Map<string, TEdge>()
  const incomingByNodeId = new Map<string, TEdge>()
  const orderByNodeId = new Map(
    sortedNodes.map((node) => [node.id, node.order])
  )

  for (const edge of graph.edges) {
    if (edge.id.trim().length === 0) {
      return graphError(graphName, "edge id is required")
    }
    if (edgeIds.has(edge.id)) {
      return graphError(graphName, `duplicate edge id ${edge.id}`)
    }
    edgeIds.add(edge.id)

    if (edge.status === "PLANNED" && !edge.transportMode) {
      return graphError(
        graphName,
        `planned edge ${edge.id} requires transportMode`
      )
    }

    const fromOrder = orderByNodeId.get(edge.fromNodeId)
    const toOrder = orderByNodeId.get(edge.toNodeId)
    if (fromOrder === undefined || toOrder === undefined) {
      return graphError(graphName, `edge ${edge.id} references an unknown node`)
    }

    if (outgoingByNodeId.has(edge.fromNodeId)) {
      return graphError(
        graphName,
        `node ${edge.fromNodeId} has multiple outgoing edges`
      )
    }
    if (incomingByNodeId.has(edge.toNodeId)) {
      return graphError(
        graphName,
        `node ${edge.toNodeId} has multiple incoming edges`
      )
    }

    if (fromOrder + 1 !== toOrder) {
      return graphError(
        graphName,
        `edge ${edge.id} must connect adjacent ordered nodes`
      )
    }

    outgoingByNodeId.set(edge.fromNodeId, edge)
    incomingByNodeId.set(edge.toNodeId, edge)
  }

  const firstNode = sortedNodes[0]
  const lastNode = sortedNodes[sortedNodes.length - 1]
  if (firstNode && incomingByNodeId.has(firstNode.id)) {
    return graphError(graphName, "first node cannot have an incoming edge")
  }
  if (lastNode && outgoingByNodeId.has(lastNode.id)) {
    return graphError(graphName, "last node cannot have an outgoing edge")
  }

  for (let index = 0; index < sortedNodes.length - 1; index += 1) {
    const fromNode = sortedNodes[index]
    const toNode = sortedNodes[index + 1]
    if (!fromNode || !toNode) {
      return graphError(graphName, "path contains an empty node slot")
    }

    const edge = outgoingByNodeId.get(fromNode.id)
    if (!edge || edge.toNodeId !== toNode.id) {
      return graphError(
        graphName,
        `path is disconnected between orders ${fromNode.order} and ${toNode.order}`
      )
    }
  }

  return { ok: true }
}

export function assertValidPathGraph<
  TNode extends PathNodeRef,
  TEdge extends PathEdgeRef,
>(
  graph: PathGraph<TNode, TEdge>,
  options: PathGraphValidationOptions = {}
): void {
  const result = validatePathGraph(graph, options)
  if (!result.ok) {
    throw new Error(result.error)
  }
}

export function validateRoutePathGraph(
  route: Pick<RouteInput, "nodes" | "edges">,
  options: PathGraphValidationOptions = {}
): PathGraphValidationResult {
  return validatePathGraph<RouteNodeInput, RouteEdgeInput>(route, {
    graphName: "route path graph",
    ...options,
  })
}

export function validateSubPlanPathGraph(
  subPlan: Pick<SubPlanInput, "nodes" | "edges">,
  options: PathGraphValidationOptions = {}
): PathGraphValidationResult {
  return validatePathGraph<SubPlanNodeInput, SubPlanEdgeInput>(subPlan, {
    graphName: "subplan path graph",
    ...options,
  })
}

export function planAppendNode<TNode extends PathNodeRef>(
  nodes: readonly TNode[]
): AppendNodePlan<TNode> {
  const sortedNodes = sortPathNodes(nodes)
  return {
    order: sortedNodes.length,
    previousNode: sortedNodes[sortedNodes.length - 1],
  }
}

export function planInsertNodeBefore<TNode extends PathNodeRef>(
  nodes: readonly TNode[],
  beforeNodeId: string,
  graphName = "path graph"
): PathGraphPlanResult<InsertNodePlan<TNode>> {
  const sortedNodes = sortPathNodes(nodes)
  const nextIndex = sortedNodes.findIndex((node) => node.id === beforeNodeId)
  if (nextIndex === -1) {
    return graphPlanError(graphName, "insert target node was not found")
  }

  return {
    ok: true,
    plan: {
      order: nextIndex,
      previousNode: sortedNodes[nextIndex - 1],
      nextNode: sortedNodes[nextIndex],
      orderUpdates: sortedNodes.slice(nextIndex).map((node, index) => ({
        nodeId: node.id,
        order: nextIndex + index + 1,
      })),
    },
  }
}

export function planInsertNodeAfter<TNode extends PathNodeRef>(
  nodes: readonly TNode[],
  afterNodeId: string,
  graphName = "path graph"
): PathGraphPlanResult<InsertNodePlan<TNode>> {
  const sortedNodes = sortPathNodes(nodes)
  const previousIndex = sortedNodes.findIndex((node) => node.id === afterNodeId)
  if (previousIndex === -1) {
    return graphPlanError(graphName, "insert target node was not found")
  }

  const insertIndex = previousIndex + 1
  return {
    ok: true,
    plan: {
      order: insertIndex,
      previousNode: sortedNodes[previousIndex],
      nextNode: sortedNodes[insertIndex],
      orderUpdates: sortedNodes.slice(insertIndex).map((node, index) => ({
        nodeId: node.id,
        order: insertIndex + index + 1,
      })),
    },
  }
}

export function planRemoveNodeRange<
  TNode extends PathNodeRef,
  TEdge extends PathEdgeRef,
>(
  graph: PathGraph<TNode, TEdge>,
  startNodeId: string,
  endNodeId: string,
  graphName = "path graph"
): PathGraphPlanResult<RemoveNodeRangePlan<TNode, TEdge>> {
  const graphResult = validatePathGraph(graph, { allowEmpty: true, graphName })
  if (!graphResult.ok) {
    return graphResult
  }

  const range = findContinuousNodeRange(graph.nodes, startNodeId, endNodeId)
  if (!range) {
    return graphPlanError(
      graphName,
      "remove range must be a continuous path segment"
    )
  }

  const removeNodeIds = new Set(range.nodes.map((node) => node.id))
  const nodesToRemove = range.nodes
  const edgesToRemove = graph.edges.filter(
    (edge) =>
      removeNodeIds.has(edge.fromNodeId) || removeNodeIds.has(edge.toNodeId)
  )
  const remainingNodes = sortPathNodes(graph.nodes).filter(
    (node) => !removeNodeIds.has(node.id)
  )

  return {
    ok: true,
    plan: {
      range,
      nodesToRemove,
      edgesToRemove,
      remainingNodes,
      orderUpdates: remainingNodes.map((node, order) => ({
        nodeId: node.id,
        order,
      })),
      bridgeFromNode: range.previousNode,
      bridgeToNode: range.nextNode,
      requiresBridgeEdge: Boolean(range.previousNode && range.nextNode),
    },
  }
}

export function edgeBridgesRemovedRange<TEdge extends PathEdgeRef>(
  edge: TEdge | undefined,
  plan: Pick<
    RemoveNodeRangePlan<PathNodeRef, PathEdgeRef>,
    "bridgeFromNode" | "bridgeToNode" | "requiresBridgeEdge"
  >
): boolean {
  if (!plan.requiresBridgeEdge) {
    return edge === undefined
  }

  if (!edge || !plan.bridgeFromNode || !plan.bridgeToNode) {
    return false
  }

  return (
    edge.fromNodeId === plan.bridgeFromNode.id &&
    edge.toNodeId === plan.bridgeToNode.id
  )
}
