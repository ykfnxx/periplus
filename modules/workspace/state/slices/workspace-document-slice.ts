import {
  deriveFlatJourneyLayout,
  nearestEventInReplacementSegment,
  projectFlatJourneyForWorkspace,
  replacementSegmentId,
} from "@/lib/journeys/flat-workspace-projection"
import type { TargetWorkspaceClientDocument } from "@/modules/data-model/contracts"
import type {
  WorkspaceDocumentSlice,
  WorkspaceSlice,
  WorkspaceState,
} from "@/modules/workspace/state/types"

export function workspaceIsLocked(
  document: TargetWorkspaceClientDocument | null
) {
  return Boolean(document?.agentRuns.some((run) => run.status === "RUNNING"))
}

export function workspaceCanMutate(
  document: TargetWorkspaceClientDocument | null
) {
  return Boolean(
    document &&
    document.accessState === "OWNER" &&
    document.session.status === "ACTIVE"
  )
}

export function shouldAcceptWorkspaceDocument(
  current: TargetWorkspaceClientDocument | null,
  incoming: TargetWorkspaceClientDocument | null
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
    ) {
      return false
    }
    set(workspaceDocumentPatch(state, workspaceDocument))
    return true
  },
  applyJourneyCommit: (workspaceDocument, summary, changedEventIds) => {
    const state = get()
    if (
      !shouldAcceptWorkspaceDocument(state.workspaceDocument, workspaceDocument)
    ) {
      return false
    }
    set({
      ...workspaceDocumentPatch(state, workspaceDocument),
      journeyCommitPresentation: {
        revision: workspaceDocument.session.flatJourney.revision,
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
  workspaceDocument: TargetWorkspaceClientDocument | null
) {
  const previousDocument = state.workspaceDocument
  const previousFlat = previousDocument?.session.flatJourney
  const nextFlat = workspaceDocument?.session.flatJourney
  const workspaceChanged = Boolean(
    previousDocument &&
    workspaceDocument &&
    previousDocument.session.id !== workspaceDocument.session.id
  )
  const topologyChanged =
    topologyKey(previousDocument) !== topologyKey(workspaceDocument)

  if (!workspaceDocument || !nextFlat || workspaceChanged || !previousFlat) {
    return {
      workspaceDocument,
      journeyCommitPresentation: null,
      viewLevel: "overview" as const,
      activeSectionEventId: null,
      hoveredEventId: null,
      selectedTransitEventId: null,
      selectedLocationEvent: null,
      selectedLocationAnchor: null,
      ...(workspaceDocument && topologyChanged
        ? {
            mapFocusRequest: {
              requestId: (state.mapFocusRequest?.requestId ?? 0) + 1,
              target: { type: "active-journey" as const, maxZoom: 12 },
            },
          }
        : {}),
    }
  }

  const replacementSectionId = replacementSegmentId(
    previousFlat,
    nextFlat,
    state.activeSectionEventId
  )
  const nextGraph = projectFlatJourneyForWorkspace(
    nextFlat,
    workspaceDocument.session.ownerId
  )
  const selectedEventId =
    state.selectedLocationEvent?.id ?? state.selectedTransitEventId
  const survivingSelected = selectedEventId
    ? nextGraph.events.find((event) => event.id === selectedEventId)
    : null
  const nearestSelectedId =
    !survivingSelected && selectedEventId && replacementSectionId
      ? nearestEventInReplacementSegment(
          previousFlat,
          nextFlat,
          selectedEventId,
          replacementSectionId
        )?.eventId
      : null
  const selectedEvent =
    survivingSelected ??
    nextGraph.events.find((event) => event.id === nearestSelectedId)
  const selectedLocationEvent =
    selectedEvent &&
    (selectedEvent.type === "VISIT" ||
      selectedEvent.type === "STAY" ||
      selectedEvent.type === "MEAL" ||
      selectedEvent.type === "ACTIVITY")
      ? selectedEvent
      : null
  const selectedTransitEventId =
    selectedEvent?.type === "TRANSIT" ? selectedEvent.id : null
  const selectedSectionId = selectedEvent
    ? (deriveFlatJourneyLayout(nextFlat).segmentByEventId.get(selectedEvent.id)
        ?.id ?? null)
    : null
  const nextSectionId = selectedEventId
    ? selectedSectionId
    : replacementSectionId
  const staysInSection = state.viewLevel === "section" && nextSectionId

  return {
    workspaceDocument,
    ...(topologyChanged
      ? {
          mapFocusRequest: {
            requestId: (state.mapFocusRequest?.requestId ?? 0) + 1,
            target: {
              type: "active-journey" as const,
              maxZoom: staysInSection ? 15 : 12,
            },
          },
        }
      : {}),
    viewLevel: staysInSection ? ("section" as const) : ("overview" as const),
    activeSectionEventId: staysInSection ? nextSectionId : null,
    hoveredEventId: null,
    selectedTransitEventId,
    selectedLocationEvent,
    selectedLocationAnchor: null,
  }
}

function topologyKey(document: TargetWorkspaceClientDocument | null) {
  const flatJourney = document?.session.flatJourney
  if (!flatJourney) return ""
  return `${flatJourney.journeyId}:${flatJourney.events
    .map((event) =>
      event.kind === "TRANSIT"
        ? `${event.eventId}:TRANSIT:${event.detail.fromEventKey}:${event.detail.toEventKey}`
        : `${event.eventId}:${event.kind}:${event.city.key}`
    )
    .join("|")}`
}
