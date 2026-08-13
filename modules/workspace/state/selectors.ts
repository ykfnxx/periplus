"use client"

import { useWorkspaceStore } from "./workspace-store"
import type { WorkspaceState } from "./types"
import { workspaceCanMutate } from "./slices/workspace-document-slice"
import { FULL_MAP_VIEWPORT_INSETS } from "../viewport"
import { projectFlatJourneyForWorkspace } from "@/lib/journeys/flat-workspace-projection"

export function selectWorkspaceJourneyView(state: WorkspaceState) {
  const session = state.workspaceDocument?.session
  return session
    ? projectFlatJourneyForWorkspace(session.flatJourney, session.ownerId)
    : null
}

export function selectWorkspaceLocked(state: WorkspaceState) {
  return Boolean(
    state.workspaceDocument?.agentRuns.some((run) => run.status === "RUNNING")
  )
}

export function selectWorkspaceRevision(state: WorkspaceState) {
  return state.workspaceDocument?.session.headWorkspaceRevision ?? 0
}

export function selectWorkspaceCanMutate(state: WorkspaceState) {
  return workspaceCanMutate(state.workspaceDocument)
}

export function useWorkspaceViewportInsets() {
  return useWorkspaceStore((state) =>
    state.isSelectingLocation && state.locationSelectionMode === "upload-photo"
      ? FULL_MAP_VIEWPORT_INSETS
      : state.mapViewportInsets
  )
}
