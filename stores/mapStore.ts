import { create } from 'zustand';
import type { Route, RoutePoint } from '@/types/route';

export type MapType = 'standard' | 'satellite' | 'terrain';
export type WorkbenchTool = 'plan' | 'places' | 'photos' | 'saved';
export type AddPointMode = 'closed' | 'search' | 'map-select' | 'manual';
export type LocationSelectionMode = 'none' | 'photo' | 'point';
export type DraftSaveState = 'idle' | 'saving' | 'success' | 'error';
export type AgentSender = (type: string, payload?: unknown) => void;

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
  isDraftLocked: boolean;
  setDraftLocked: (isDraftLocked: boolean) => void;
  draftSaveState: DraftSaveState;
  setDraftSaveState: (draftSaveState: DraftSaveState) => void;
  agentMessages: string[];
  appendAgentMessage: (message: string) => void;
  clearAgentMessages: () => void;
  sendAgentEvent: AgentSender | null;
  setAgentSender: (sendAgentEvent: AgentSender | null) => void;
  selectedPoint: RoutePoint | null;
  setSelectedPoint: (point: RoutePoint | null) => void;
  mapType: MapType;
  setMapType: (type: MapType) => void;
  activeWorkbenchTool: WorkbenchTool;
  setActiveWorkbenchTool: (tool: WorkbenchTool) => void;
  composerInput: string;
  setComposerInput: (input: string) => void;
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
  pendingPhotoDataUrl: string | null;
  isSelectingLocation: boolean;
}

export const useMapStore = create<MapState>((set) => ({
  map: null,
  setMap: (map) => set({ map }),
  currentRoute: null,
  setCurrentRoute: (currentRoute) => set({ currentRoute }),
  isDraftLocked: false,
  setDraftLocked: (isDraftLocked) => set({ isDraftLocked }),
  draftSaveState: 'idle',
  setDraftSaveState: (draftSaveState) => set({ draftSaveState }),
  agentMessages: [],
  appendAgentMessage: (message) =>
    set((state) => ({
      agentMessages: [...state.agentMessages, message].slice(-120),
    })),
  clearAgentMessages: () => set({ agentMessages: [] }),
  sendAgentEvent: null,
  setAgentSender: (sendAgentEvent) => set({ sendAgentEvent }),
  selectedPoint: null,
  setSelectedPoint: (selectedPoint) => set({ selectedPoint }),
  mapType: 'standard',
  setMapType: (mapType) => set({ mapType }),
  activeWorkbenchTool: 'plan',
  setActiveWorkbenchTool: (activeWorkbenchTool) => set({ activeWorkbenchTool }),
  composerInput: '',
  setComposerInput: (composerInput) => set({ composerInput }),
  editingPointId: null,
  setEditingPointId: (editingPointId) =>
    set((state) => ({
      editingPointId,
      activeWorkbenchTool: editingPointId ? 'plan' : state.activeWorkbenchTool,
    })),
  addPointMode: 'closed',
  setAddPointMode: (addPointMode) =>
    set((state) => ({
      addPointMode,
      activeWorkbenchTool:
        addPointMode === 'closed' ? state.activeWorkbenchTool : 'places',
    })),
  pointSelectionDraft: null,
  setPointSelectionDraft: (pointSelectionDraft) => set({ pointSelectionDraft }),
  locationSelectionMode: 'none',
  startPhotoLocationSelection: (imageDataUrl) =>
    set({
      pendingPhotoDataUrl: imageDataUrl,
      isSelectingLocation: true,
      locationSelectionMode: 'photo',
      activeWorkbenchTool: 'photos',
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
      activeWorkbenchTool: 'places',
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
  pendingPhotoDataUrl: null,
  isSelectingLocation: false,
}));
