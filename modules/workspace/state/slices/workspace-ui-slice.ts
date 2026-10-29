import type {
  WorkspaceSlice,
  WorkspaceUiSlice,
} from "@/modules/workspace/state/types"
import { WORKBENCH_VIEWPORT_INSETS } from "@/modules/workspace/viewport"

export const createWorkspaceUiSlice: WorkspaceSlice<WorkspaceUiSlice> = (
  set
) => ({
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
  selectedEventId: null,
  selectedEventAnchor: null,
  selectEvent: (selectedEventId, anchor) =>
    set({
      selectedEventId,
      selectedEventAnchor: anchor ?? null,
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
