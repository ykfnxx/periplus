import {
  applyTransitPlanBundle,
  buildTransitPlanRequest,
  mergeWorkspaceTransitPlans,
  selectedTransitPlan,
  transitPlanFingerprint,
} from "@/lib/journeys/planning"
import { mapTransitEvents } from "@/modules/workspace/state/helpers"
import type {
  DraftSlice,
  WorkspaceSlice,
} from "@/modules/workspace/state/types"
import type { DraftJourney } from "@/types/journey"

export const createDraftSlice: WorkspaceSlice<DraftSlice> = (set) => ({
  draftJourney: null,
  setDraftJourney: (draftJourney) =>
    set((state) => {
      const mergedJourney = mergeWorkspaceTransitPlans(
        state.draftJourney,
        draftJourney
      )
      const activeSectionStillExists = Boolean(
        mergedJourney?.events.some(
          (event) =>
            event.id === state.activeSectionEventId && event.type === "SECTION"
        )
      )
      const topologyChanged =
        journeyTopologyKey(state.draftJourney) !==
        journeyTopologyKey(mergedJourney)
      return {
        draftJourney: mergedJourney,
        ...(mergedJourney && topologyChanged
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
        ...(mergedJourney && activeSectionStillExists
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
    }),
  markTransitPlansPlanning: (eventIds) =>
    set((state) => ({
      draftJourney: mapTransitEvents(state.draftJourney, (event) =>
        eventIds.includes(event.id)
          ? {
              ...event,
              detail: {
                ...event.detail,
                planningStatus: event.detail.plans?.length
                  ? "STALE"
                  : "PLANNING",
              },
            }
          : event
      ),
    })),
  applyTransitPlanBundles: (bundles) =>
    set((state) => ({
      draftJourney: mapTransitEvents(state.draftJourney, (event) => {
        const bundle = bundles.find((item) => item.transitEventId === event.id)
        if (!bundle || !state.draftJourney) return event
        const request = buildTransitPlanRequest(
          event,
          state.draftJourney.events
        )
        if (
          !request ||
          transitPlanFingerprint(request) !== bundle.requestFingerprint
        ) {
          return event
        }
        return applyTransitPlanBundle(event, bundle)
      }),
    })),
  markTransitPlanFailures: (failures) =>
    set((state) => ({
      draftJourney: mapTransitEvents(state.draftJourney, (event) => {
        const failure = failures.find(
          (item) => item.transitEventId === event.id
        )
        return failure
          ? {
              ...event,
              detail: {
                ...event.detail,
                planningStatus: event.detail.plans?.length ? "STALE" : "FAILED",
                planningWarning: failure.message,
              },
            }
          : event
      }),
    })),
  selectTransitPlan: (eventId, planId) =>
    set((state) => ({
      draftJourney: mapTransitEvents(state.draftJourney, (event) => {
        if (
          event.id !== eventId ||
          !event.detail.plans?.some((plan) => plan.id === planId)
        ) {
          return event
        }
        const next = {
          ...event,
          detail: { ...event.detail, selectedPlanId: planId },
        }
        const selected = selectedTransitPlan(next)
        return {
          ...next,
          detail: {
            ...next.detail,
            plannedDurationMinutes: selected
              ? Math.max(1, Math.round(selected.durationSeconds / 60))
              : event.detail.plannedDurationMinutes,
            plannedDistanceKm: selected
              ? Math.round((selected.distanceMeters / 1000) * 10) / 10
              : event.detail.plannedDistanceKm,
            plannedCostEstimate:
              selected?.fareAmount ?? event.detail.plannedCostEstimate,
          },
        }
      }),
    })),
  isDraftLocked: false,
  setDraftLocked: (isDraftLocked) => set({ isDraftLocked }),
  draftSaveState: "idle",
  setDraftSaveState: (draftSaveState) => set({ draftSaveState }),
})

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
