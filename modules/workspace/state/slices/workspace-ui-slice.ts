import type {
  AnchorClusterState,
  WorkspaceSlice,
  WorkspaceUiSlice,
} from "@/modules/workspace/state/types"
import { WORKBENCH_VIEWPORT_INSETS } from "@/modules/workspace/viewport"

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
      hoveredRouteNodeId: null,
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
      hoveredRouteNodeId: null,
      selectedEdgeId: null,
      selectedLocationPoint: null,
      selectedLocationAnchor: null,
      anchorCluster: emptyAnchorCluster(),
    }),
  hoveredRouteNodeId: null,
  setHoveredRouteNodeId: (hoveredRouteNodeId) => set({ hoveredRouteNodeId }),
  mapViewportInsets: WORKBENCH_VIEWPORT_INSETS,
  setMapViewportInsets: (mapViewportInsets) =>
    set((state) => {
      const current = state.mapViewportInsets
      return current.top === mapViewportInsets.top &&
        current.right === mapViewportInsets.right &&
        current.bottom === mapViewportInsets.bottom &&
        current.left === mapViewportInsets.left
        ? {}
        : { mapViewportInsets }
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
  mobileSheetSnap: "half",
  setMobileSheetSnap: (mobileSheetSnap) => set({ mobileSheetSnap }),
  composerInput: "",
  setComposerInput: (composerInput) => set({ composerInput }),
})
