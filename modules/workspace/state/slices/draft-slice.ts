import type {
  DraftSlice,
  WorkspaceSlice,
  WorkspaceState,
} from "@/modules/workspace/state/types"
import type { DraftJourney } from "@/types/journey"

export const createDraftSlice: WorkspaceSlice<DraftSlice> = (set, get) => ({
  draftJourney: null,
  draftRevision: 0,
  applyDraftSnapshot: (draftJourney, draftRevision) =>
    set((state) => draftJourneyPatch(state, draftJourney, draftRevision)),
  selectTransitPlan: (eventId, planId) => {
    const state = get()
    const event = state.draftJourney?.events.find(
      (candidate) => candidate.id === eventId
    )
    if (
      !event ||
      event.type !== "TRANSIT" ||
      !event.detail.plans?.some((plan) => plan.id === planId) ||
      event.detail.selectedPlanId === planId ||
      state.isDraftLocked
    ) {
      return
    }
    state.sendAgentEvent?.("draft.command", {
      tool: "journey.select_transit_plan",
      input: {
        eventId,
        planId,
        expectedRevision: state.draftRevision,
        idempotencyKey: `browser-select:${state.draftJourney?.id}:${eventId}:${planId}:${state.draftRevision}`,
      },
    })
  },
  isDraftLocked: false,
  setDraftLocked: (isDraftLocked) => set({ isDraftLocked }),
  draftSaveState: "idle",
  setDraftSaveState: (draftSaveState) => set({ draftSaveState }),
})

function draftJourneyPatch(
  state: WorkspaceState,
  draftJourney: DraftJourney | null,
  draftRevision: number
) {
  const activeSectionStillExists = Boolean(
    draftJourney?.events.some(
      (event) =>
        event.id === state.activeSectionEventId && event.type === "SECTION"
    )
  )
  const topologyChanged =
    journeyTopologyKey(state.draftJourney) !== journeyTopologyKey(draftJourney)
  return {
    draftJourney,
    draftRevision,
    ...(draftJourney && topologyChanged
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
    ...(draftJourney && activeSectionStillExists
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

function journeyTopologyKey(journey: DraftJourney | null) {
  if (!journey) return ""
  const events = journey.events
    .map(
      (event) => `${event.id}:${event.parentEventId ?? "root"}:${event.type}`
    )
    .join("|")
  const links = journey.links
    .map(
      (link) => `${link.id}:${link.fromEventId}:${link.toEventId}:${link.kind}`
    )
    .join("|")
  return `${journey.id}:${events}:${links}`
}
