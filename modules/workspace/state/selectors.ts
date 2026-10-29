"use client"

import { useWorkspaceStore } from "./workspace-store"
import type { WorkspaceState } from "./types"
import { workspaceCanMutate } from "./slices/workspace-document-slice"

export function selectWorkspaceJourney(state: WorkspaceState) {
  return state.workspaceDocument?.session.journey ?? null
}

export function selectSelectedWorkspaceEvent(state: WorkspaceState) {
  return (
    selectWorkspaceJourney(state)?.events.find(
      (event) => event.id === state.selectedEventId
    ) ?? null
  )
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
  return useWorkspaceStore((state) => state.mapViewportInsets)
}
