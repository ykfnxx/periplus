import { z } from "zod"
import { NextRequest, NextResponse } from "next/server"
import {
  AuthRequiredError,
  PermissionDeniedError,
  requireCurrentUser,
} from "@/modules/auth/server/context"
import { targetWorkspaceTitleSchema } from "@/modules/data-model/contracts"
import {
  archiveWorkspace,
  renameWorkspace,
  WorkspaceArchivedError,
  WorkspaceInputError,
  WorkspaceRunningError,
} from "@/modules/data/workspaces/workspace-repository"

const workspaceRenameSchema = z.object({ title: targetWorkspaceTitleSchema })

function errorResponse(error: unknown) {
  if (error instanceof AuthRequiredError) {
    return NextResponse.json(
      {
        error: { code: "auth_required", message: "Authentication required" },
      },
      { status: 401 }
    )
  }
  if (error instanceof PermissionDeniedError) {
    return NextResponse.json(
      { error: { code: "permission_denied", message: "Permission denied" } },
      { status: 403 }
    )
  }
  if (error instanceof WorkspaceArchivedError) {
    return NextResponse.json(
      { error: { code: "workspace_archived", message: error.message } },
      { status: 410 }
    )
  }
  if (error instanceof WorkspaceRunningError) {
    return NextResponse.json(
      { error: { code: "workspace_running", message: error.message } },
      { status: 409 }
    )
  }
  if (error instanceof WorkspaceInputError) {
    return NextResponse.json(
      { error: { code: "invalid_input", message: error.message } },
      { status: 400 }
    )
  }
  return null
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const context = await requireCurrentUser()
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        {
          error: {
            code: "invalid_input",
            message: "Workspace title must be 1 to 48 characters",
          },
        },
        { status: 400 }
      )
    }
    const input = workspaceRenameSchema.safeParse(body)
    if (!input.success) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_input",
            message: "Workspace title must be 1 to 48 characters",
          },
        },
        { status: 400 }
      )
    }
    const workspace = await renameWorkspace(context, id, input.data.title)
    if (!workspace) {
      return NextResponse.json(
        {
          error: {
            code: "workspace_not_found",
            message: "Workspace was not found",
          },
        },
        { status: 404 }
      )
    }
    return NextResponse.json({ workspace })
  } catch (error) {
    const response = errorResponse(error)
    if (response) return response
    throw error
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const context = await requireCurrentUser()
    const archived = await archiveWorkspace(context, id)
    if (!archived) {
      return NextResponse.json(
        {
          error: {
            code: "workspace_not_found",
            message: "Workspace was not found",
          },
        },
        { status: 404 }
      )
    }
    return new NextResponse(null, { status: 204 })
  } catch (error) {
    const response = errorResponse(error)
    if (response) return response
    throw error
  }
}
