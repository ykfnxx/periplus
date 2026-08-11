import type { TargetWorkspaceHistoryEntry } from "@/modules/data-model/contracts"

interface WorkspaceErrorResponse {
  error?: {
    code?: string
    message?: string
  }
}

export class WorkspaceApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string
  ) {
    super(message)
    this.name = "WorkspaceApiError"
  }
}

async function parseWorkspaceResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as
    | T
    | WorkspaceErrorResponse
    | null
  if (!response.ok) {
    const error = (body as WorkspaceErrorResponse | null)?.error
    throw new WorkspaceApiError(
      error?.message ?? "工作区请求失败",
      response.status,
      error?.code
    )
  }
  return body as T
}

export async function listWorkspaces() {
  const response = await fetch("/api/agent/workspaces", {
    credentials: "include",
    cache: "no-store",
  })
  const body = await parseWorkspaceResponse<{
    workspaces: TargetWorkspaceHistoryEntry[]
  }>(response)
  return body.workspaces
}

export async function renameWorkspace(workspaceId: string, title: string) {
  const response = await fetch(
    `/api/agent/workspaces/${encodeURIComponent(workspaceId)}`,
    {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }
  )
  const body = await parseWorkspaceResponse<{
    workspace: TargetWorkspaceHistoryEntry
  }>(response)
  return body.workspace
}

export async function archiveWorkspace(workspaceId: string) {
  const response = await fetch(
    `/api/agent/workspaces/${encodeURIComponent(workspaceId)}`,
    {
      method: "DELETE",
      credentials: "include",
    }
  )
  if (!response.ok) await parseWorkspaceResponse<never>(response)
}
