import type {
  WorkspaceDocumentSlice,
  WorkspaceSlice,
  WorkspaceState,
} from "@/modules/workspace/state/types"
import type { TargetWorkspaceDocument } from "@/modules/data-model/contracts"

export function workspaceIsLocked(document: TargetWorkspaceDocument | null) {
  return Boolean(document?.agentRuns.some((run) => run.status === "RUNNING"))
}

export function workspaceCanMutate(document: TargetWorkspaceDocument | null) {
  return Boolean(
    document &&
    document.accessState === "OWNER" &&
    document.session.status === "ACTIVE" &&
    document.draftState !== "STALE" &&
    document.draftState !== "CONFLICT"
  )
}

export function shouldAcceptWorkspaceDocument(
  current: TargetWorkspaceDocument | null,
  incoming: TargetWorkspaceDocument | null
) {
  if (!current || !incoming) return true
  if (current.session.id !== incoming.session.id) return true
  return (
    incoming.session.headWorkspaceRevision >=
    current.session.headWorkspaceRevision
  )
}

export const createWorkspaceDocumentSlice: WorkspaceSlice<
  WorkspaceDocumentSlice
> = (set, get) => ({
  workspaceDocument: null,
  applyWorkspaceDocument: (workspaceDocument) => {
    const state = get()
    if (
      !shouldAcceptWorkspaceDocument(state.workspaceDocument, workspaceDocument)
    ) {
      return false
    }
    set(workspaceDocumentPatch(state, workspaceDocument))
    return true
  },
  failedTransitPlanCommandId: null,
  setFailedTransitPlanCommandId: (failedTransitPlanCommandId) =>
    set({ failedTransitPlanCommandId }),
  selectTransitPlan: (eventId, planId) => {
    const state = get()
    const document = state.workspaceDocument
    const event = document?.session.headGraph.events.find(
      (candidate) => candidate.id === eventId
    )
    const planningRun =
      event?.type === "TRANSIT" && event.detail.activePlanningRunId
        ? document?.session.headGraph.transitPlanningRuns.find(
            (run) => run.id === event.detail.activePlanningRunId
          )
        : null
    if (
      !document ||
      !event ||
      event.type !== "TRANSIT" ||
      !planningRun?.plans.some((plan) => plan.id === planId) ||
      event.detail.selectedPlanId === planId ||
      !workspaceCanMutate(document) ||
      workspaceIsLocked(document)
    ) {
      return
    }
    const revision = document.session.headWorkspaceRevision
    const commandId = `browser-select:${document.session.id}:${eventId}:${planId}:${revision}`
    state.sendAgentEvent?.("workspace.command", {
      commandId,
      expectedRevision: revision,
      idempotencyKey: commandId,
      command: {
        name: "journey.select_transit_plan",
        payload: { eventId, planId },
      },
    })
  },
  workspaceCommitState: "idle",
  setWorkspaceCommitState: (workspaceCommitState) =>
    set({ workspaceCommitState }),
})

function workspaceDocumentPatch(
  state: WorkspaceState,
  workspaceDocument: TargetWorkspaceDocument | null
) {
  const graph = workspaceDocument?.session.headGraph
  const activeSectionStillExists = Boolean(
    graph?.events.some(
      (event) =>
        event.id === state.activeSectionEventId &&
        event.type === "SECTION" &&
        !event.retiredRevision
    )
  )
  const topologyChanged =
    topologyKey(state.workspaceDocument) !== topologyKey(workspaceDocument)
  return {
    workspaceDocument,
    ...(graph && topologyChanged
      ? {
          mapFocusRequest: {
            requestId: (state.mapFocusRequest?.requestId ?? 0) + 1,
            target: {
              type: "active-journey" as const,
              maxZoom: activeSectionStillExists ? 15 : 12,
            },
          },
        }
      : {}),
    ...(graph && activeSectionStillExists
      ? {}
      : {
          viewLevel: "overview" as const,
          activeSectionEventId: null,
          hoveredEventId: null,
          selectedTransitEventId: null,
          selectedLocationEvent: null,
          selectedLocationAnchor: null,
        }),
  }
}

function topologyKey(document: TargetWorkspaceDocument | null) {
  const graph = document?.session.headGraph
  if (!graph) return ""
  const events = graph.events
    .map(
      (event) =>
        `${event.id}:${event.parentSectionEventId ?? "root"}:${event.type}:${event.retiredRevision ?? "active"}`
    )
    .join("|")
  const links = graph.links
    .map(
      (link) =>
        `${link.id}:${link.fromEventId}:${link.toEventId}:${link.kind}:${link.retiredRevision ?? "active"}`
    )
    .join("|")
  return `${graph.id}:${events}:${links}`
}
