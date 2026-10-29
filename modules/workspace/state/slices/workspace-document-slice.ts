import type { TargetWorkspaceDocument } from "@/modules/data-model/contracts"
import type {
  WorkspaceDocumentSlice,
  WorkspaceSlice,
  WorkspaceState,
} from "@/modules/workspace/state/types"

export function workspaceIsLocked(document: TargetWorkspaceDocument | null) {
  return Boolean(document?.agentRuns.some((run) => run.status === "RUNNING"))
}

export function workspaceCanMutate(document: TargetWorkspaceDocument | null) {
  return Boolean(
    document &&
    document.accessState === "OWNER" &&
    document.session.status === "ACTIVE"
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
  journeyCommitPresentation: null,
  applyWorkspaceDocument: (workspaceDocument) => {
    const state = get()
    if (
      !shouldAcceptWorkspaceDocument(state.workspaceDocument, workspaceDocument)
    )
      return false
    set(workspaceDocumentPatch(state, workspaceDocument))
    return true
  },
  applyJourneyCommit: (workspaceDocument, summary, changedEventIds) => {
    const state = get()
    if (
      !shouldAcceptWorkspaceDocument(state.workspaceDocument, workspaceDocument)
    )
      return false
    set({
      ...workspaceDocumentPatch(state, workspaceDocument),
      journeyCommitPresentation: {
        revision: workspaceDocument.session.journey.revision,
        summary,
        changedEventIds,
      },
    })
    return true
  },
  clearJourneyCommitPresentation: (revision) =>
    set((state) =>
      state.journeyCommitPresentation?.revision === revision
        ? { journeyCommitPresentation: null }
        : {}
    ),
})

function workspaceDocumentPatch(
  state: WorkspaceState,
  workspaceDocument: TargetWorkspaceDocument | null
) {
  const previous = state.workspaceDocument
  const next = workspaceDocument?.session.journey
  const sameWorkspace = previous?.session.id === workspaceDocument?.session.id
  const selectedSurvives = next?.events.some(
    (event) => event.id === state.selectedEventId
  )
  const previousIndex =
    previous?.session.journey.events.findIndex(
      (event) => event.id === state.selectedEventId
    ) ?? -1
  // A commit replaces the complete chain; keep identity or the nearest surviving
  // chain position, without constructing city scopes or storing an event copy.
  const selectedEventId =
    !sameWorkspace || !next
      ? null
      : selectedSurvives
        ? state.selectedEventId
        : previousIndex >= 0
          ? (next.events[Math.min(previousIndex, next.events.length - 1)]?.id ??
            null)
          : null
  return {
    workspaceDocument,
    journeyCommitPresentation: null,
    selectedEventId,
    selectedEventAnchor: null,
    hoveredEventId: null,
    ...(!sameWorkspace && workspaceDocument
      ? {
          mapFocusRequest: {
            requestId: (state.mapFocusRequest?.requestId ?? 0) + 1,
            target: { type: "active-journey" as const, maxZoom: 12 },
          },
        }
      : {}),
  }
}
