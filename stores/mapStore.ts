import { create } from 'zustand';
import type { Route, RoutePoint } from '@/types/route';

export type MapType = 'standard' | 'satellite' | 'terrain';
export type WorkbenchTab = 'explore' | 'plan' | 'saved';
export type AddPointMode = 'closed' | 'search' | 'map-select' | 'manual';
export type LocationSelectionMode = 'none' | 'photo' | 'point';

export interface PointSelectionDraft {
  lat: number;
  lng: number;
}

export interface PhotoShare {
  id: string;
  lat: number;
  lng: number;
  imageDataUrl: string;
  caption: string;
  createdAt: number;
}

interface MapState {
  map: AMap.Map | null;
  setMap: (map: AMap.Map | null) => void;
  currentRoute: Route | null;
  setCurrentRoute: (route: Route | null) => void;
  selectedPoint: RoutePoint | null;
  setSelectedPoint: (point: RoutePoint | null) => void;
  mapType: MapType;
  setMapType: (type: MapType) => void;
  activeWorkbenchTab: WorkbenchTab;
  setActiveWorkbenchTab: (tab: WorkbenchTab) => void;
  editingPointId: string | null;
  setEditingPointId: (pointId: string | null) => void;
  addPointMode: AddPointMode;
  setAddPointMode: (mode: AddPointMode) => void;
  pointSelectionDraft: PointSelectionDraft | null;
  setPointSelectionDraft: (draft: PointSelectionDraft | null) => void;
  locationSelectionMode: LocationSelectionMode;
  startPhotoLocationSelection: (imageDataUrl: string) => void;
  startPointLocationSelection: () => void;
  clearLocationSelection: () => void;
  photoShares: PhotoShare[];
  addPhotoShare: (photo: Omit<PhotoShare, 'id' | 'createdAt'>) => void;
  removePhotoShare: (id: string) => void;
  updatePhotoShareCaption: (id: string, caption: string) => void;
  selectedPhotoShare: PhotoShare | null;
  setSelectedPhotoShare: (photo: PhotoShare | null) => void;
  // Manual location selection mode
  pendingPhotoDataUrl: string | null;
  setPendingPhotoDataUrl: (dataUrl: string | null) => void;
  isSelectingLocation: boolean;
  setIsSelectingLocation: (selecting: boolean) => void;
}

export const useMapStore = create<MapState>((set) => ({
  map: null,
  setMap: (map) => set({ map }),
  currentRoute: null,
  setCurrentRoute: (currentRoute) => set({ currentRoute }),
  selectedPoint: null,
  setSelectedPoint: (selectedPoint) => set({ selectedPoint }),
  mapType: 'standard',
  setMapType: (mapType) => set({ mapType }),
  activeWorkbenchTab: 'explore',
  setActiveWorkbenchTab: (activeWorkbenchTab) => set({ activeWorkbenchTab }),
  editingPointId: null,
  setEditingPointId: (editingPointId) =>
    set((state) => ({
      editingPointId,
      activeWorkbenchTab: editingPointId ? 'plan' : state.activeWorkbenchTab,
    })),
  addPointMode: 'closed',
  setAddPointMode: (addPointMode) =>
    set((state) => ({
      addPointMode,
      activeWorkbenchTab:
        addPointMode === 'closed' ? state.activeWorkbenchTab : 'plan',
    })),
  pointSelectionDraft: null,
  setPointSelectionDraft: (pointSelectionDraft) => set({ pointSelectionDraft }),
  locationSelectionMode: 'none',
  startPhotoLocationSelection: (imageDataUrl) =>
    set({
      pendingPhotoDataUrl: imageDataUrl,
      isSelectingLocation: true,
      locationSelectionMode: 'photo',
      activeWorkbenchTab: 'plan',
      addPointMode: 'closed',
      pointSelectionDraft: null,
    }),
  startPointLocationSelection: () =>
    set({
      pendingPhotoDataUrl: null,
      pointSelectionDraft: null,
      isSelectingLocation: true,
      locationSelectionMode: 'point',
      addPointMode: 'map-select',
      activeWorkbenchTab: 'plan',
    }),
  clearLocationSelection: () =>
    set({
      pendingPhotoDataUrl: null,
      isSelectingLocation: false,
      locationSelectionMode: 'none',
      addPointMode: 'closed',
    }),
  photoShares: [],
  addPhotoShare: (photo) =>
    set((state) => ({
      photoShares: [
        ...state.photoShares,
        { ...photo, id: `photo-${Date.now()}`, createdAt: Date.now() },
      ],
    })),
  removePhotoShare: (id) =>
    set((state) => {
      const newShares = state.photoShares.filter((p) => p.id !== id);
      const newSelected =
        state.selectedPhotoShare?.id === id ? null : state.selectedPhotoShare;
      return { photoShares: newShares, selectedPhotoShare: newSelected };
    }),
  updatePhotoShareCaption: (id, caption) =>
    set((state) => {
      const newShares = state.photoShares.map((p) =>
        p.id === id ? { ...p, caption } : p
      );
      const newSelected =
        state.selectedPhotoShare?.id === id
          ? { ...state.selectedPhotoShare, caption }
          : state.selectedPhotoShare;
      return { photoShares: newShares, selectedPhotoShare: newSelected };
    }),
  selectedPhotoShare: null,
  setSelectedPhotoShare: (selectedPhotoShare) => set({ selectedPhotoShare }),
  // Manual location selection mode
  pendingPhotoDataUrl: null,
  setPendingPhotoDataUrl: (pendingPhotoDataUrl) =>
    set((state) => {
      if (pendingPhotoDataUrl) {
        return {
          pendingPhotoDataUrl,
          locationSelectionMode: 'photo',
          isSelectingLocation: true,
          activeWorkbenchTab: 'plan',
          addPointMode: 'closed',
          pointSelectionDraft: null,
        };
      }

      return {
        pendingPhotoDataUrl,
        ...(state.locationSelectionMode === 'photo'
          ? {
              locationSelectionMode: 'none' as const,
              isSelectingLocation: false,
            }
          : {}),
      };
    }),
  isSelectingLocation: false,
  setIsSelectingLocation: (isSelectingLocation) =>
    set((state) => {
      if (isSelectingLocation) {
        if (state.locationSelectionMode !== 'none') {
          return { isSelectingLocation };
        }

        return {
          isSelectingLocation,
          locationSelectionMode: 'point',
          addPointMode: 'map-select',
          pendingPhotoDataUrl: null,
          pointSelectionDraft: null,
          activeWorkbenchTab: 'plan',
        };
      }

      return {
        isSelectingLocation,
        locationSelectionMode: 'none',
        ...(state.locationSelectionMode === 'point'
          ? { addPointMode: 'closed' as const }
          : {}),
        ...(state.locationSelectionMode === 'photo'
          ? { pendingPhotoDataUrl: null }
          : {}),
      };
    }),
}));
