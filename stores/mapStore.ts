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

interface MapState {
  map: AMap.Map | null;
  setMap: (map: AMap.Map | null) => void;
  currentRoute: Route | null;
  setCurrentRoute: (route: Route | null) => void;
  selectedPoint: RoutePoint | null;
  setSelectedPoint: (point: RoutePoint | null) => void;
  mapType: MapType;
  setMapType: (type: MapType) => void;
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
}));
