import type {
  AnchorClusterState,
  WorkspaceSlice,
  WorkspaceUiSlice,
} from "@/modules/workspace/state/types"

function emptyAnchorCluster(): AnchorClusterState {
  return {
    isScattered: false,
    scatterCenter: null,
    scatteredAnchors: [],
  }
}

export const createWorkspaceUiSlice: WorkspaceSlice<WorkspaceUiSlice> = (
  set
) => ({
  viewLevel: "overview",
  activeRouteNodeId: null,
  enterCityView: (activeRouteNodeId) =>
    set({
      viewLevel: "city",
      activeRouteNodeId,
      selectedEdgeId: null,
      selectedLocationPoint: null,
      selectedLocationAnchor: null,
      selectedPhotoShare: null,
      selectedPhotoAnchor: null,
      anchorCluster: emptyAnchorCluster(),
    }),
  returnToOverview: () =>
    set({
      viewLevel: "overview",
      activeRouteNodeId: null,
      selectedEdgeId: null,
      selectedLocationPoint: null,
      selectedLocationAnchor: null,
      anchorCluster: emptyAnchorCluster(),
    }),
  selectedEdgeId: null,
  setSelectedEdgeId: (selectedEdgeId) => set({ selectedEdgeId }),
  selectedLocationPoint: null,
  selectedLocationAnchor: null,
  setSelectedLocationPoint: (selectedLocationPoint, anchor) =>
    set({
      selectedLocationPoint,
      selectedLocationAnchor: anchor ?? null,
      ...(selectedLocationPoint
        ? { selectedPhotoShare: null, selectedPhotoAnchor: null }
        : {}),
    }),
  activeMapPanel: "none",
  setActiveMapPanel: (activeMapPanel) => set({ activeMapPanel }),
  workbenchTab: "preview",
  setWorkbenchTab: (workbenchTab) => set({ workbenchTab }),
  composerInput: "",
  setComposerInput: (composerInput) => set({ composerInput }),
})
