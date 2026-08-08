import { NextResponse } from "next/server"
import {
  AuthRequiredError,
  requireCurrentUser,
} from "@/modules/auth/server/context"
import { listWorkspaceHistory } from "@/modules/data/workspaces/workspace-repository"

export async function GET() {
  try {
    const context = await requireCurrentUser()
    return NextResponse.json({
      workspaces: await listWorkspaceHistory(context),
    })
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return NextResponse.json(
        {
          error: { code: "auth_required", message: "Authentication required" },
        },
        { status: 401 }
      )
    }
    throw error
  }
}
