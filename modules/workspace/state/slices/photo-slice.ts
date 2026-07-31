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
  startPhotoLocationSelection: (file, imageDataUrl) =>
    set({
      pendingPhotoUpload: { file, imageDataUrl },
      pendingPhotoDataUrl: imageDataUrl,
      isSelectingLocation: true,
      locationSelectionMode: "photo",
      activeMapPanel: "photo",
      pointSelectionDraft: null,
    }),
  startPointLocationSelection: () =>
    set({
      pendingPhotoUpload: null,
      pendingPhotoDataUrl: null,
      uploadLocationSelectionPhotoId: null,
      pointSelectionDraft: null,
      isSelectingLocation: true,
      locationSelectionMode: "point",
    }),
  clearLocationSelection: () =>
    set({
      pendingPhotoUpload: null,
      pendingPhotoDataUrl: null,
      uploadLocationSelectionPhotoId: null,
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
  updatePhotoShareCaption: (id, caption) =>
    set((state) => ({
      photoShares: state.photoShares.map((photo) =>
        photo.id === id ? { ...photo, caption } : photo
      ),
      selectedPhotoShare:
        state.selectedPhotoShare?.id === id
          ? { ...state.selectedPhotoShare, caption }
          : state.selectedPhotoShare,
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
  pendingPhotoUpload: null,
  pendingPhotoDataUrl: null,
  uploadLocationSelectionPhotoId: null,
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
  uploadModalOpen: false,
  setUploadModalOpen: (uploadModalOpen) => set({ uploadModalOpen }),
  uploadStep: 1,
  setUploadStep: (uploadStep) => set({ uploadStep }),
  uploadPhotos: [],
  setUploadPhotos: (uploadPhotos) =>
    set((state) => ({
      uploadPhotos:
        typeof uploadPhotos === "function"
          ? uploadPhotos(state.uploadPhotos)
          : uploadPhotos,
    })),
  addUploadPhoto: (photo) =>
    set((state) => ({
      uploadPhotos: [...state.uploadPhotos, photo],
    })),
  updateUploadPhoto: (id, updates) =>
    set((state) => ({
      uploadPhotos: state.uploadPhotos.map((photo) =>
        photo.id === id ? { ...photo, ...updates } : photo
      ),
    })),
  startUploadPhotoLocationSelection: (uploadLocationSelectionPhotoId) =>
    set({
      activeMapPanel: "none",
      isSelectingLocation: true,
      locationSelectionMode: "upload-photo",
      pendingPhotoUpload: null,
      pendingPhotoDataUrl: null,
      pointSelectionDraft: null,
      uploadLocationSelectionPhotoId,
      uploadModalOpen: false,
    }),
  clearUploadState: () =>
    set({
      isSelectingLocation: false,
      locationSelectionMode: "none",
      pendingPhotoUpload: null,
      pendingPhotoDataUrl: null,
      uploadLocationSelectionPhotoId: null,
      uploadModalOpen: false,
      uploadStep: 1,
      uploadPhotos: [],
    }),
})
