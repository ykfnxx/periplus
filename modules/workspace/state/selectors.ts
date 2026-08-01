"use client"

import { useWorkspaceStore } from "./workspace-store"
import type { WorkspaceState } from "./types"
import { workspaceCanMutate } from "./slices/workspace-document-slice"
import { FULL_MAP_VIEWPORT_INSETS } from "../viewport"

export function selectWorkspaceGraph(state: WorkspaceState) {
  return state.workspaceDocument?.session.headGraph ?? null
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

export function selectWorkspaceCanRecover(state: WorkspaceState) {
  const document = state.workspaceDocument
  return Boolean(
    document &&
    document.accessState === "OWNER" &&
    document.session.status === "ACTIVE" &&
    (document.draftState === "STALE" || document.draftState === "CONFLICT")
  )
}

export function useWorkspaceViewportInsets() {
  return useWorkspaceStore((state) =>
    state.isSelectingLocation && state.locationSelectionMode === "upload-photo"
      ? FULL_MAP_VIEWPORT_INSETS
      : state.mapViewportInsets
  )
}
