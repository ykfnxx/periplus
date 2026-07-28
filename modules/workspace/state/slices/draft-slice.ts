import {
  applyRoutePlanBundle,
  buildRoutePlanRequest,
  mergeWorkspaceRoutePlans,
  routePlanFingerprint,
  selectedRoutePlan,
} from "@/lib/routes/planning"
import { mapRouteEdges } from "@/modules/workspace/state/helpers"
import type {
  DraftSlice,
  WorkspaceSlice,
} from "@/modules/workspace/state/types"

export const createDraftSlice: WorkspaceSlice<DraftSlice> = (set) => ({
  draftRoute: null,
  setDraftRoute: (draftRoute) =>
    set((state) => {
      const mergedRoute = mergeWorkspaceRoutePlans(state.draftRoute, draftRoute)
      const activeRouteNodeStillExists = Boolean(
        mergedRoute?.nodes.some((node) => node.id === state.activeRouteNodeId)
      )
      return {
        draftRoute: mergedRoute,
        ...(mergedRoute && activeRouteNodeStillExists
          ? {}
          : {
              viewLevel: "overview" as const,
              activeRouteNodeId: null,
              selectedEdgeId: null,
              selectedLocationPoint: null,
              selectedLocationAnchor: null,
            }),
      }
    }),
  edgeGeometries: {},
  mergeEdgeGeometries: (entries) =>
    set((state) => ({
      edgeGeometries: { ...state.edgeGeometries, ...entries },
    })),
  markRoutePlansPlanning: (edgeIds) =>
    set((state) => ({
      draftRoute: mapRouteEdges(state.draftRoute, (edge) =>
        edgeIds.includes(edge.id)
          ? {
              ...edge,
              planningStatus: edge.plans?.length ? "STALE" : "PLANNING",
            }
          : edge
      ),
    })),
  applyRoutePlanBundles: (bundles) =>
    set((state) => ({
      draftRoute: mapRouteEdges(state.draftRoute, (edge, nodes) => {
        const bundle = bundles.find((item) => item.edgeId === edge.id)
        if (!bundle) return edge
        const from = nodes.find((node) => node.id === edge.fromNodeId)
        const to = nodes.find((node) => node.id === edge.toNodeId)
        const request =
          from && to ? buildRoutePlanRequest(edge, from, to) : null
        if (
          !request ||
          routePlanFingerprint(request) !== bundle.requestFingerprint
        ) {
          return edge
        }
        return applyRoutePlanBundle(edge, bundle)
      }),
    })),
  markRoutePlanFailures: (failures) =>
    set((state) => ({
      draftRoute: mapRouteEdges(state.draftRoute, (edge) => {
        const failure = failures.find((item) => item.edgeId === edge.id)
        return failure
          ? {
              ...edge,
              planningStatus: edge.plans?.length ? "STALE" : "FAILED",
              planningWarning: failure.message,
            }
          : edge
      }),
    })),
  selectRoutePlan: (edgeId, planId) =>
    set((state) => ({
      draftRoute: mapRouteEdges(state.draftRoute, (edge) => {
        if (
          edge.id !== edgeId ||
          !edge.plans?.some((plan) => plan.id === planId)
        ) {
          return edge
        }
        const next = { ...edge, selectedPlanId: planId }
        const selected = selectedRoutePlan(next)
        return {
          ...next,
          durationMinutes: selected
            ? Math.max(1, Math.round(selected.durationSeconds / 60))
            : edge.durationMinutes,
          distanceKm: selected
            ? Math.round((selected.distanceMeters / 1000) * 10) / 10
            : edge.distanceKm,
          costEstimate: selected?.fareAmount ?? edge.costEstimate,
        }
      }),
    })),
  isDraftLocked: false,
  setDraftLocked: (isDraftLocked) => set({ isDraftLocked }),
  draftSaveState: "idle",
  setDraftSaveState: (draftSaveState) => set({ draftSaveState }),
})
