import type { AuthContext } from "@/modules/auth/server/context"
import type { Journey, JourneyInput } from "@/types/journey"
import type { JourneyToolName } from "./contracts"
import { periplusServerConfig } from "@/config/periplus.server"
import {
  createJourney,
  getJourney,
  updateJourney,
} from "@/modules/data/journeys/journey-repository"
import { DraftInputError, DraftSessionService } from "./draft-session-service"

interface JourneyRepositoryPort {
  get(context: AuthContext, journeyId: string): Promise<Journey | null>
  create(context: AuthContext, input: JourneyInput): Promise<Journey>
  update(
    context: AuthContext,
    journeyId: string,
    input: JourneyInput,
    expectedRevision?: number | null
  ): Promise<Journey | null>
}

interface WorkspaceCommandDependencies {
  journeys?: JourneyRepositoryPort
  persistTransitPlanning?: boolean
}

const defaultJourneyRepository: JourneyRepositoryPort = {
  get: getJourney,
  create: createJourney,
  update: updateJourney,
}

export class WorkspaceCommandService {
  private readonly journeys: JourneyRepositoryPort
  private readonly persistTransitPlanning: boolean

  constructor(
    private readonly drafts: DraftSessionService,
    dependencies: WorkspaceCommandDependencies = {}
  ) {
    this.journeys = dependencies.journeys ?? defaultJourneyRepository
    this.persistTransitPlanning =
      dependencies.persistTransitPlanning ??
      periplusServerConfig.transitPlanning.retention === "PERSISTED"
  }

  loadSavedJourney(context: AuthContext, sessionId: string, journeyId: string) {
    return this.journeys.get(context, journeyId).then((journey) => {
      if (!journey) throw new DraftInputError("Journey not found")
      return this.drafts.loadPersistedJourney(sessionId, journey)
    })
  }

  replaceDraft(sessionId: string, journey: JourneyInput | Journey | null) {
    return this.drafts.replaceDraft(sessionId, journey)
  }

  resetDraft(sessionId: string) {
    return this.drafts.replaceDraft(sessionId, null)
  }

  async saveDraft(context: AuthContext, sessionId: string) {
    const draft = this.drafts.getDraftForSave(sessionId)
    const journeyInput = this.persistTransitPlanning
      ? draft.journeyInput
      : withoutTransitPlans(draft.journeyInput)
    const savedJourney = draft.sourceJourneyId
      ? await this.journeys.update(
          context,
          draft.sourceJourneyId,
          journeyInput,
          draft.baseRevision
        )
      : await this.journeys.create(context, journeyInput)

    if (!savedJourney) throw new DraftInputError("Journey not found")
    return this.drafts.markDraftSaved(
      sessionId,
      savedJourney,
      !this.persistTransitPlanning
    )
  }

  executeDraftTool(
    sessionId: string,
    tool: JourneyToolName,
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

function withoutTransitPlans(input: JourneyInput): JourneyInput {
  return {
    ...input,
    events: input.events.map((event) =>
      event.type === "TRANSIT"
        ? {
            ...event,
            detail: {
              ...event.detail,
              plans: undefined,
              selectedPlanId: undefined,
              planningFingerprint: undefined,
              planningWarning: undefined,
              planningStatus: "EMPTY" as const,
            },
          }
        : event
    ),
  }
}
