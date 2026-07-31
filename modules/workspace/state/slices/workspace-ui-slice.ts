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
  activeSectionEventId: null,
  enterSectionView: (activeSectionEventId) =>
    set({
      viewLevel: "section",
      activeSectionEventId,
      hoveredEventId: null,
      selectedTransitEventId: null,
      selectedLocationEvent: null,
      selectedLocationAnchor: null,
      selectedPhotoShare: null,
      selectedPhotoAnchor: null,
      anchorCluster: emptyAnchorCluster(),
    }),
  returnToOverview: () =>
    set({
      viewLevel: "overview",
      activeSectionEventId: null,
      hoveredEventId: null,
      selectedTransitEventId: null,
      selectedLocationEvent: null,
      selectedLocationAnchor: null,
      anchorCluster: emptyAnchorCluster(),
    }),
  hoveredEventId: null,
  setHoveredEventId: (hoveredEventId) => set({ hoveredEventId }),
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
  selectedTransitEventId: null,
  setSelectedTransitEventId: (selectedTransitEventId) =>
    set({ selectedTransitEventId }),
  selectedLocationEvent: null,
  selectedLocationAnchor: null,
  setSelectedLocationEvent: (selectedLocationEvent, anchor) =>
    set({
      selectedLocationEvent,
      selectedLocationAnchor: anchor ?? null,
      ...(selectedLocationEvent
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
