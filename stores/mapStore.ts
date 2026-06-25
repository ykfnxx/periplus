import { create } from 'zustand';

export type MapType = 'standard' | 'satellite' | 'terrain';

export interface RoutePoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  order: number;
  stayDays?: number;
  notes?: string;
}

export interface Route {
  id: string;
  name: string;
  description?: string;
  points: RoutePoint[];
  createdAt: string;
  updatedAt: string;
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
  setPendingPhotoDataUrl: (pendingPhotoDataUrl) => set({ pendingPhotoDataUrl }),
  isSelectingLocation: false,
  setIsSelectingLocation: (isSelectingLocation) => set({ isSelectingLocation }),
}));
