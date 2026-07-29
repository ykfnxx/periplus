"use client"

import { useWorkspaceStore } from "./workspace-store"
import { FULL_MAP_VIEWPORT_INSETS } from "../viewport"

export function useWorkspaceViewportInsets() {
  return useWorkspaceStore((state) =>
    state.isSelectingLocation &&
    state.locationSelectionMode === "upload-photo"
      ? FULL_MAP_VIEWPORT_INSETS
      : state.mapViewportInsets
  )
}
