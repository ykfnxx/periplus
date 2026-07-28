"use client"

import { useWorkspaceStore } from "./workspace-store"
import { workspaceViewportInsets } from "../viewport"

export function useWorkspaceViewportInsets() {
  const workbenchVisible = useWorkspaceStore(
    (state) =>
      !(
        state.isSelectingLocation &&
        state.locationSelectionMode === "upload-photo"
      )
  )

  return workspaceViewportInsets(workbenchVisible)
}
