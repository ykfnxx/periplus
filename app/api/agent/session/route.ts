import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import {
  AuthRequiredError,
  PermissionDeniedError,
  requireCurrentUser,
} from "@/modules/auth/server/context"
import type { TargetJourneyGraphSnapshot } from "@/modules/data-model/contracts"
import { getJourney } from "@/modules/data/journeys/journey-repository"
import {
  createWorkspace,
  getWorkspaceClientDocument,
} from "@/modules/data/workspaces/workspace-repository"
import { issueWorkspaceTicket } from "@/modules/data/workspaces/workspace-ticket"
import { createSilkRoadJourney } from "@/lib/mock-journeys"

function emptyJourney(ownerId: string): TargetJourneyGraphSnapshot {
  return {
    id: randomUUID(),
    ownerId,
    revision: 1,
    status: "DRAFT",
    visibility: "PRIVATE",
    title: "未命名行程",
    events: [],
    links: [],
    replacements: [],
    branchSelections: [],
    transitPlanningRuns: [],
    eventAssetLinks: [],
    observations: [],
    eventSourceLinks: [],
  }
}

export async function GET(request: Request) {
  try {
    const context = await requireCurrentUser()
    const search = new URL(request.url).searchParams
    const workspaceId = search.get("workspace")?.trim() || null
    const journeyId = search.get("journey")?.trim() || null
    if (workspaceId && journeyId) {
      return NextResponse.json(
        { error: { code: "invalid_input", message: "Choose one source" } },
        { status: 400 }
      )
    }

    let workspace = workspaceId
      ? await getWorkspaceClientDocument(context, workspaceId)
      : null
    if (workspaceId && !workspace) {
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

    if (!workspace) {
      const sourceJourney =
        journeyId && journeyId !== "preset-silk-road"
          ? await getJourney(context, journeyId)
          : null
      if (journeyId && journeyId !== "preset-silk-road" && !sourceJourney) {
        return NextResponse.json(
          {
            error: {
              code: "journey_not_found",
              message: "Journey was not found",
            },
          },
          { status: 404 }
        )
      }
      const graph = sourceJourney
        ? sourceJourney
        : journeyId === "preset-silk-road"
          ? createSilkRoadJourney({ id: randomUUID(), ownerId: context.userId })
          : emptyJourney(context.userId)
      const session = await createWorkspace(context, {
        graph,
        ...(sourceJourney
          ? {
              sourceJourneyId: sourceJourney.id,
              baseJourneyRevision: sourceJourney.revision,
            }
          : {}),
      })
      workspace = await getWorkspaceClientDocument(context, session.id)
    }

    if (!workspace) {
      return NextResponse.json(
        {
          error: {
            code: "workspace_unavailable",
            message: "Workspace could not be created",
          },
        },
        { status: 500 }
      )
    }

    if (workspace.session.status !== "ACTIVE") {
      return NextResponse.json(
        {
          error: {
            code: "workspace_archived",
            message: "Workspace is archived",
          },
        },
        { status: 410 }
      )
    }
    if (workspace.accessState !== "OWNER") {
      return NextResponse.json(
        {
          error: {
            code: "permission_denied",
            message: "Workspace is not accessible",
          },
        },
        { status: 403 }
      )
    }

    return NextResponse.json({
      workspace,
      ticket: issueWorkspaceTicket(context.userId, workspace.session.id),
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
    if (error instanceof PermissionDeniedError) {
      return NextResponse.json(
        {
          error: { code: "permission_denied", message: "Permission denied" },
        },
        { status: 403 }
      )
    }
    throw error
  }
}
