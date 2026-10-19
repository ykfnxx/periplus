import type {
  AnchorClusterState,
  PhotoSlice,
  WorkspaceSlice,
} from "@/modules/workspace/state/types"

function emptyAnchorCluster(): AnchorClusterState {
  return {
    isScattered: false,
    scatterCenter: null,
    scatteredAnchors: [],
  }
}

export const createPhotoSlice: WorkspaceSlice<PhotoSlice> = (set) => ({
  pointSelectionDraft: null,
  setPointSelectionDraft: (pointSelectionDraft) => set({ pointSelectionDraft }),
  locationSelectionMode: "none",
  startPointLocationSelection: () =>
    set({
      pointSelectionDraft: null,
      isSelectingLocation: true,
      locationSelectionMode: "point",
    }),
  clearLocationSelection: () =>
    set({
      isSelectingLocation: false,
      locationSelectionMode: "none",
    }),
  photoShares: [],
  setPhotoShares: (photoShares) => set({ photoShares }),
  addPhotoShare: (photo) =>
    set((state) => ({
      photoShares: [photo, ...state.photoShares],
    })),
  upsertPhotoShare: (photo) =>
    set((state) => ({
      photoShares: state.photoShares.some(
        (existing) => existing.id === photo.id
      )
        ? state.photoShares.map((existing) =>
            existing.id === photo.id ? photo : existing
          )
        : [photo, ...state.photoShares],
      selectedPhotoShare:
        state.selectedPhotoShare?.id === photo.id
          ? photo
          : state.selectedPhotoShare,
      lightboxPhotoShare:
        state.lightboxPhotoShare?.id === photo.id
          ? photo
          : state.lightboxPhotoShare,
    })),
  removePhotoShare: (id) =>
    set((state) => ({
      photoShares: state.photoShares.filter((photo) => photo.id !== id),
      selectedPhotoShare:
        state.selectedPhotoShare?.id === id ? null : state.selectedPhotoShare,
      lightboxPhotoShare:
        state.lightboxPhotoShare?.id === id ? null : state.lightboxPhotoShare,
    })),
  selectedPhotoShare: null,
  selectedPhotoAnchor: null,
  setSelectedPhotoShare: (selectedPhotoShare, anchor) =>
    set({
      selectedPhotoShare,
      selectedPhotoAnchor: anchor ?? null,
      ...(selectedPhotoShare
        ? { selectedLocationEvent: null, selectedLocationAnchor: null }
        : {}),
    }),
  lightboxPhotoShare: null,
  setLightboxPhotoShare: (lightboxPhotoShare) => set({ lightboxPhotoShare }),
  isSelectingLocation: false,
  anchorCluster: emptyAnchorCluster(),
  setAnchorCluster: (anchorCluster) => set({ anchorCluster }),
  expandCluster: (center, anchors) =>
    set({
      anchorCluster: {
        isScattered: true,
        scatterCenter: center,
        scatteredAnchors: anchors,
      },
    }),
  collapseCluster: () =>
    set({
      anchorCluster: emptyAnchorCluster(),
    }),
})
