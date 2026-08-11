"use client"

import { useCallback, useRef, useState } from "react"
import type {
  TargetWorkspaceDocument,
  TargetWorkspaceHistoryEntry,
} from "@/modules/data-model/contracts"
import {
  archiveWorkspace,
  listWorkspaces,
  renameWorkspace,
} from "@/modules/data/workspaces/client"
import { useWorkspaceStore } from "@/modules/workspace/state/workspace-store"
import type {
  WorkspaceAction,
  WorkspaceSwitcherController,
} from "./WorkspaceSwitcherPanel"

type WorkspaceDocumentWithTitle = TargetWorkspaceDocument & {
  session: TargetWorkspaceDocument["session"] & { title: string }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "工作区请求失败"
}

export default function useWorkspaceSwitcherController(): WorkspaceSwitcherController {
  const document = useWorkspaceStore(
    (state) => state.workspaceDocument as WorkspaceDocumentWithTitle | null
  )
  const [workspaces, setWorkspaces] = useState<TargetWorkspaceHistoryEntry[]>(
    []
  )
  const [listStatus, setListStatus] =
    useState<WorkspaceSwitcherController["listStatus"]>("idle")
  const [listError, setListError] = useState<string | null>(null)
  const [pendingAction, setPendingAction] = useState<WorkspaceAction | null>(
    null
  )
  const [actionError, setActionError] = useState<{
    workspaceId: string
    message: string
  } | null>(null)
  const requestedListRef = useRef(false)

  const loadWorkspaceList = useCallback(async () => {
    setListStatus("loading")
    setListError(null)
    try {
      setWorkspaces(await listWorkspaces())
      setListStatus("ready")
    } catch (error) {
      setListStatus("error")
      setListError(errorMessage(error))
    }
  }, [])

  const openManager = useCallback(() => {
    if (requestedListRef.current) return
    requestedListRef.current = true
    void loadWorkspaceList()
  }, [loadWorkspaceList])

  const retryWorkspaceList = useCallback(() => {
    void loadWorkspaceList()
  }, [loadWorkspaceList])

  const clearActionError = useCallback(() => setActionError(null), [])

  const handleRename = useCallback(
    async (workspaceId: string, title: string) => {
      setPendingAction({ type: "rename", workspaceId })
      setActionError(null)
      try {
        const renamed = await renameWorkspace(workspaceId, title)
        setWorkspaces((current) => [
          renamed,
          ...current.filter((workspace) => workspace.id !== workspaceId),
        ])

        const currentDocument = useWorkspaceStore.getState()
          .workspaceDocument as WorkspaceDocumentWithTitle | null
        if (currentDocument?.session.id === workspaceId) {
          const updatedDocument: WorkspaceDocumentWithTitle = {
            ...currentDocument,
            session: {
              ...currentDocument.session,
              title: renamed.title,
              updatedAt: renamed.updatedAt,
            },
          }
          useWorkspaceStore.getState().applyWorkspaceDocument(updatedDocument)
        }
      } catch (error) {
        setActionError({ workspaceId, message: errorMessage(error) })
        throw error
      } finally {
        setPendingAction(null)
      }
    },
    []
  )

  const handleDelete = useCallback(
    async (workspaceId: string) => {
      const nextWorkspaceId = workspaces.find(
        (workspace) => workspace.id !== workspaceId
      )?.id
      setPendingAction({ type: "delete", workspaceId })
      setActionError(null)
      try {
        await archiveWorkspace(workspaceId)
        setWorkspaces((current) =>
          current.filter((workspace) => workspace.id !== workspaceId)
        )
        if (workspaceId === document?.session.id) {
          window.location.assign(
            nextWorkspaceId
              ? `/workspace?workspace=${encodeURIComponent(nextWorkspaceId)}`
              : "/workspace"
          )
        }
      } catch (error) {
        setActionError({ workspaceId, message: errorMessage(error) })
        throw error
      } finally {
        setPendingAction(null)
      }
    },
    [document?.session.id, workspaces]
  )

  const currentWorkspaceId = document?.session.id ?? ""
  const currentTitle = document ? document.session.title : "正在载入工作区"
  const displayedWorkspaces = workspaces.map((workspace) =>
    workspace.id === currentWorkspaceId && workspace.title !== currentTitle
      ? { ...workspace, title: currentTitle }
      : workspace
  )

  return {
    workspaces: displayedWorkspaces,
    currentWorkspaceId,
    currentTitle,
    listStatus,
    listError,
    pendingAction,
    actionError,
    onOpen: openManager,
    onRetry: retryWorkspaceList,
    onClearActionError: clearActionError,
    onCreate: () => window.location.assign("/workspace"),
    onSelect: (workspaceId) =>
      window.location.assign(
        `/workspace?workspace=${encodeURIComponent(workspaceId)}`
      ),
    onRename: handleRename,
    onDelete: handleDelete,
  }
}
