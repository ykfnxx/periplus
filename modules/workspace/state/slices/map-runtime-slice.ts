import type {
  MapRuntimeSlice,
  WorkspaceSlice,
} from "@/modules/workspace/state/types"

export const createMapRuntimeSlice: WorkspaceSlice<MapRuntimeSlice> = (
  set
) => ({
  map: null,
  setMap: (map) => set({ map, mapReady: map !== null }),
  mapReady: false,
  routeRenderedRevisionKey: null,
  setRouteRenderedRevisionKey: (routeRenderedRevisionKey) =>
    set({ routeRenderedRevisionKey }),
  mapError: null,
  setMapError: (mapError) => set({ mapError }),
  mapFocusRequest: null,
  requestMapFocus: (target) =>
    set((state) => ({
      mapFocusRequest: {
        requestId: (state.mapFocusRequest?.requestId ?? 0) + 1,
        target,
      },
    })),
  clearMapFocusRequest: (requestId) =>
    set((state) =>
      state.mapFocusRequest?.requestId === requestId
        ? { mapFocusRequest: null }
        : {}
    ),
  mapType: "standard",
  setMapType: (mapType) => set({ mapType }),
})
