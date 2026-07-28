import type { AuthContext } from "@/modules/auth/server/context"
import type { Route, RouteInput } from "@/types/route"
import type { DraftToolName } from "./contracts"
import { periplusServerConfig } from "@/config/periplus.server"
import {
  createRoute,
  getRoute,
  updateRoute,
} from "@/modules/data/routes/route-repository"
import { persistRoutePlans } from "@/modules/data/routes/route-plan-repository"
import { DraftInputError, DraftSessionService } from "./draft-session-service"

interface RouteRepositoryPort {
  get(context: AuthContext, routeId: string): Promise<Route | null>
  create(context: AuthContext, input: RouteInput): Promise<Route>
  update(
    context: AuthContext,
    routeId: string,
    input: RouteInput,
    expectedVersion?: number | null
  ): Promise<Route | null>
}

interface WorkspaceCommandDependencies {
  routes?: RouteRepositoryPort
  persistPlans?: (route: Route) => Promise<void>
  persistRoutePlanning?: boolean
}

const defaultRouteRepository: RouteRepositoryPort = {
  get: getRoute,
  create: createRoute,
  update: updateRoute,
}

export class WorkspaceCommandService {
  private readonly routes: RouteRepositoryPort
  private readonly persistPlans: (route: Route) => Promise<void>
  private readonly persistRoutePlanning: boolean

  constructor(
    private readonly drafts: DraftSessionService,
    dependencies: WorkspaceCommandDependencies = {}
  ) {
    this.routes = dependencies.routes ?? defaultRouteRepository
    this.persistPlans = dependencies.persistPlans ?? persistRoutePlans
    this.persistRoutePlanning =
      dependencies.persistRoutePlanning ??
      periplusServerConfig.routePlanning.retention === "PERSISTED"
  }

  loadSavedRoute(context: AuthContext, sessionId: string, routeId: string) {
    return this.routes.get(context, routeId).then((route) => {
      if (!route) throw new DraftInputError("Route not found")
      return this.drafts.loadPersistedRoute(sessionId, route)
    })
  }

  replaceDraft(sessionId: string, route: RouteInput | Route | null) {
    return this.drafts.replaceDraft(sessionId, route)
  }

  resetDraft(sessionId: string) {
    return this.drafts.replaceDraft(sessionId, null)
  }

  async saveDraft(context: AuthContext, sessionId: string) {
    const draft = this.drafts.getDraftForSave(sessionId)
    const savedRoute = draft.sourceRouteId
      ? await this.routes.update(
          context,
          draft.sourceRouteId,
          draft.routeInput,
          draft.baseVersion
        )
      : await this.routes.create(context, draft.routeInput)

    if (!savedRoute) throw new DraftInputError("Route not found")

    if (!this.persistRoutePlanning) {
      return this.drafts.markDraftSaved(sessionId, savedRoute, true)
    }

    await this.persistPlans({
      ...savedRoute,
      name: draft.document.name,
      description: draft.document.description,
      nodes: draft.document.nodes,
      edges: draft.document.edges,
      subPlans: draft.document.subPlans,
    })
    const persisted = await this.routes.get(context, savedRoute.id)
    if (!persisted) throw new DraftInputError("Route not found")
    return this.drafts.markDraftSaved(sessionId, persisted)
  }

  executeDraftTool(
    sessionId: string,
    tool: DraftToolName,
    input: Record<string, unknown>
  ) {
    return this.drafts.callTool(sessionId, tool, input)
  }

  acceptSuggestion(sessionId: string, suggestionId: string) {
    return this.drafts.acceptSuggestion(sessionId, suggestionId)
  }

  rejectSuggestion(sessionId: string, suggestionId: string) {
    return this.drafts.rejectSuggestion(sessionId, suggestionId)
  }
}
