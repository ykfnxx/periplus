import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { z } from "zod"
import { context as otelContext } from "@opentelemetry/api"
import type { AuthContext } from "@/modules/auth/server/context"
import { hotelSearchInputSchema } from "@/backend/mcp/schemas/hotel"
import {
  isAttractionCategory,
  isAttractionSearch,
} from "@/lib/places/attractions"
import type { HotelCandidate } from "@/lib/hotels/types"
import type { PlaceImage, PlaceVerification } from "@/lib/places/types"
import {
  placeEnrichInputSchema,
  placeResolveForJourneyEventInputSchema,
  placeResolveInputSchema,
  placeSearchInputSchema,
} from "@/backend/mcp/schemas/place"
import {
  targetCommandBodySchema,
  WORKSPACE_AGENT_RUN_LEASE_SECONDS,
  type PlanValidationReport,
} from "@/modules/data-model/contracts"
import { resolveJourneyProjection } from "@/modules/data/journeys/journey-projection"
import { validateJourneyPlan } from "@/modules/data/journeys/journey-plan-validator"
import {
  createPlaceIntelligenceService,
  type PlaceIntelligenceService,
  type PlaceProviderUsageContext,
} from "@/modules/data/places/place-service"
import {
  createHotelSearchService,
  type HotelSearchService,
  type HotelProviderUsageContext,
} from "@/modules/data/hotels/hotel-search-service"
import {
  appendWorkspaceMessage,
  appendWorkspaceMessageDelta,
  createWorkspaceSuggestion,
  finishWorkspaceAgentRun,
  heartbeatWorkspaceAgentRun,
  reconcileExpiredWorkspaceAgentRun,
  startWorkspaceAgentRun,
  WorkspaceInputError,
  WorkspaceRevisionConflictError,
} from "@/modules/data/workspaces/workspace-repository"
import {
  type PreparedAgentDraft,
  WorkspaceCommandService,
} from "@/modules/workspace/server/workspace-command-service"
import type {
  AgentConversationMessage,
  AgentEventEmitter,
  AgentMode,
} from "../types"
import { buildPrompt, promptVersion } from "./prompt"
import type {
  AgentRuntime,
  AgentRuntimeExit,
  AgentRuntimeRun,
  AgentToolServer,
} from "./runtime"
import { parseSuggestion } from "./suggestion"
import {
  evalContentHash,
  type EvalTraceInput,
  type EvalTraceSink,
} from "./evals"
import {
  AgentRunTelemetry,
  redactedInput,
  startAgentRunTelemetry,
  type TelemetrySpan,
} from "../observability"
import {
  OpenInferenceSpanKind,
  PROMPT_TEMPLATE_VERSION,
  TOOL_NAME,
} from "@arizeai/openinference-semantic-conventions"

interface AgentGatewayOptions {
  backendUrl: string
  projectRoot: string
  runtimeOwnerId?: string
  agentRunLeaseSeconds?: number
  heartbeatIntervalMs?: number | null
  now?: () => Date
  placeService?: Pick<
    PlaceIntelligenceService,
    | "searchPlaces"
    | "resolvePlace"
    | "resolvePlaceForJourneyEvent"
    | "enrichPlace"
  >
  hotelService?: Pick<HotelSearchService, "searchHotels">
  evalTrace?: {
    scenarioId: string
    sink: EvalTraceSink
  }
}

type HotelStaySelection = {
  candidate: HotelCandidate
  stayDetail: {
    plannedLat: number
    plannedLng: number
    coordinateSystem: "WGS84"
    coordinateProvider: "rollinggo"
    hotelOffer: {
      provider: "rollinggo"
      providerHotelId: string
      address?: string
      startingPrice?: { amount: number; currency: string }
      coverImageUrl?: string
      externalUrl?: string
      fetchedAt: string
    }
  }
}

type HotelStayState =
  | { kind: "not_searched" }
  | { kind: "empty" }
  | { kind: "available"; selection: HotelStaySelection }
  | {
      kind: "consumed"
      selection: HotelStaySelection
      idempotencyKey: string
    }

interface RunningAgent {
  workspaceId: string
  context: AuthContext
  runId: string
  capabilityToken: string
  runtimeRun: AgentRuntimeRun | null
  cancelled: boolean
  finished: boolean
  runtimeFailed: boolean
  stdout: string
  assistantMessageId: string
  outputWrite: Promise<void>
  heartbeatTimer: ReturnType<typeof setInterval> | null
  traceRunSpanId: string
  traceFailure: Error | null
  telemetry: AgentRunTelemetry
  requiresPlanValidation: boolean
  lastPlanValidation: PlanValidationReport | null
  hotelStayState: HotelStayState
  verifiedPlaces: Map<string, PlaceVerification>
  drafts: Map<string, PreparedAgentDraft>
  draftRequests: Map<string, string>
  draftHotelSelections: Map<string, HotelStaySelection>
  latestDraftId: string | null
  draftValidationAttempts: number
}

export const agentToolRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("workspace.get") }).strict(),
  z
    .object({
      type: z.literal("workspace.validate_plan"),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      type: z.literal("workspace.validate_draft"),
      expectedRevision: z.number().int().nonnegative(),
      idempotencyKey: z.string().trim().min(1),
      commands: z.array(z.unknown()).min(1).max(40),
      previousDraftId: z.string().trim().min(1).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("workspace.prepare_transit"),
      previousDraftId: z.string().trim().min(1),
      idempotencyKey: z.string().trim().min(1),
      eventId: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("workspace.commit_draft"),
      draftId: z.string().trim().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("hotel.search"),
      requestId: z.string().trim().min(1),
      input: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal("workspace.project"),
      scopeSectionEventId: z.string().nullable(),
      mode: z.enum(["PLANNER", "EXECUTION", "TRAVELOGUE"]),
      asOfRevision: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("workspace.command"),
      expectedRevision: z.number().int().nonnegative(),
      idempotencyKey: z.string().trim().min(1),
      command: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal("place.search"),
      requestId: z.string().trim().min(1),
      input: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal("place.resolve"),
      requestId: z.string().trim().min(1),
      input: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal("place.resolve_for_journey_event"),
      requestId: z.string().trim().min(1),
      input: z.unknown(),
    })
    .strict(),
  z
    .object({
      type: z.literal("place.enrich"),
      requestId: z.string().trim().min(1),
      input: z.unknown(),
    })
    .strict(),
])

export type AgentToolRequest = z.infer<typeof agentToolRequestSchema>

type PlaceAgentToolRequest = Extract<
  AgentToolRequest,
  { type: `place.${string}` }
>
type HotelAgentToolRequest = Extract<AgentToolRequest, { type: "hotel.search" }>

function isPlaceToolRequest(
  request: AgentToolRequest
): request is PlaceAgentToolRequest {
  return request.type.startsWith("place.")
}

function isEvidenceToolRequest(request: AgentToolRequest) {
  return isPlaceToolRequest(request) || request.type === "hotel.search"
}

function asInputRecord(input: unknown): Record<string, unknown> {
  return input != null && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {}
}

function withoutRequestId<T extends { requestId: string }>(
  input: T
): Omit<T, "requestId"> {
  const output: Partial<T> = { ...input }
  delete output.requestId
  return output as Omit<T, "requestId">
}

function selectedHotelStay(candidate: HotelCandidate) {
  return {
    plannedLat: candidate.coordinates.lat,
    plannedLng: candidate.coordinates.lng,
    coordinateSystem: "WGS84" as const,
    coordinateProvider: "rollinggo" as const,
    hotelOffer: {
      provider: candidate.provider,
      providerHotelId: candidate.providerHotelId,
      address: candidate.address,
      startingPrice: candidate.startingPrice,
      coverImageUrl: candidate.imageUrl,
      externalUrl: candidate.externalUrl,
      fetchedAt: candidate.fetchedAt,
    },
  }
}

function draftCommandsWithSelectedHotel(
  running: RunningAgent,
  commands: Array<ReturnType<typeof targetCommandBodySchema.parse>>,
  hasSelectedHotel: boolean
) {
  const state = running.hotelStayState
  const stayCommands = commands.filter(
    (command) =>
      (command.name === "journey.add_event" &&
        command.payload.event.type === "STAY") ||
      (command.name === "journey.update_event" &&
        command.payload.patch.type === "STAY") ||
      (command.name === "journey.replace_event" &&
        command.payload.successor.type === "STAY")
  )
  if (!stayCommands.length) return { commands, selection: undefined }
  if (
    stayCommands.length > 1 ||
    hasSelectedHotel ||
    state.kind !== "available"
  ) {
    throw new WorkspaceInputError("酒店检索每次只能写入首位候选一次")
  }

  const selected = state.selection
  return {
    commands: commands.map((command) => {
      if (
        command.name === "journey.add_event" &&
        command.payload.event.type === "STAY"
      ) {
        return {
          ...command,
          payload: {
            ...command.payload,
            event: {
              ...command.payload.event,
              title: selected.candidate.name,
              detail: {
                ...command.payload.event.detail,
                ...selected.stayDetail,
              },
            },
          },
        }
      }
      if (
        command.name === "journey.update_event" &&
        command.payload.patch.type === "STAY"
      ) {
        return {
          ...command,
          payload: {
            ...command.payload,
            patch: {
              ...command.payload.patch,
              title: selected.candidate.name,
              detail: {
                ...command.payload.patch.detail,
                ...selected.stayDetail,
              },
            },
          },
        }
      }
      if (
        command.name === "journey.replace_event" &&
        command.payload.successor.type === "STAY"
      ) {
        return {
          ...command,
          payload: {
            ...command.payload,
            successor: {
              ...command.payload.successor,
              title: selected.candidate.name,
              detail: {
                ...command.payload.successor.detail,
                ...selected.stayDetail,
              },
            },
          },
        }
      }
      return command
    }),
    selection: selected,
  }
}

function placeVerificationKey(verification: PlaceVerification) {
  const { ref } = verification
  return [
    ref.provider,
    ref.providerId ?? "",
    ref.canonicalName,
    ref.lat,
    ref.lng,
    ref.coordinateSystem,
  ].join(":")
}

function selectedCoverImage(result: unknown): PlaceImage | undefined {
  if (
    !result ||
    typeof result !== "object" ||
    !("command" in result) ||
    !result.command ||
    typeof result.command !== "object" ||
    !("payload" in result.command) ||
    !result.command.payload ||
    typeof result.command.payload !== "object" ||
    !("patch" in result.command.payload) ||
    !result.command.payload.patch ||
    typeof result.command.payload.patch !== "object" ||
    !("detail" in result.command.payload.patch) ||
    !result.command.payload.patch.detail ||
    typeof result.command.payload.patch.detail !== "object" ||
    !("providerCoverImage" in result.command.payload.patch.detail)
  ) {
    return undefined
  }
  return result.command.payload.patch.detail.providerCoverImage as PlaceImage
}

type DraftPosition = {
  placement: "UNSCHEDULED" | "START" | "END" | "BEFORE" | "AFTER" | "BRANCH"
  parentSectionEventId?: string | null
  anchorEventId?: string
  forkEventId?: string
  joinEventId?: string
}

function positionTouchesIssue(
  position: DraftPosition,
  eventIds: ReadonlySet<string>
) {
  if (position.placement === "START" || position.placement === "END") {
    return Boolean(
      position.parentSectionEventId &&
      eventIds.has(position.parentSectionEventId)
    )
  }
  if (position.placement === "BEFORE" || position.placement === "AFTER") {
    return Boolean(
      position.anchorEventId && eventIds.has(position.anchorEventId)
    )
  }
  if (position.placement === "BRANCH") {
    return (
      Boolean(position.forkEventId && eventIds.has(position.forkEventId)) ||
      Boolean(position.joinEventId && eventIds.has(position.joinEventId))
    )
  }
  return false
}

function isRootCityInsertion(
  command: ReturnType<typeof targetCommandBodySchema.parse>
) {
  if (
    command.name !== "journey.add_event" ||
    command.payload.event.type !== "SECTION" ||
    command.payload.event.detail.kind !== "CITY"
  ) {
    return false
  }
  const { position } = command.payload
  return (
    (position.placement === "START" || position.placement === "END") &&
    position.parentSectionEventId === null
  )
}

function isScopeEvent(
  draft: PreparedAgentDraft,
  eventId: string,
  scopeEventId: string | null
) {
  return (
    draft.after.events.find((event) => event.id === eventId)
      ?.parentSectionEventId === scopeEventId
  )
}

function isScopeLink(
  draft: PreparedAgentDraft,
  linkId: string,
  scopeEventId: string | null
) {
  const link = draft.after.links.find((candidate) => candidate.id === linkId)
  return Boolean(
    link &&
    isScopeEvent(draft, link.fromEventId, scopeEventId) &&
    isScopeEvent(draft, link.toEventId, scopeEventId)
  )
}

function projectionRepairTargetsScope(
  command: ReturnType<typeof targetCommandBodySchema.parse>,
  draft: PreparedAgentDraft,
  scopeEventId: string | null
) {
  switch (command.name) {
    case "journey.add_link":
      return (
        isScopeEvent(draft, command.payload.link.fromEventId, scopeEventId) &&
        isScopeEvent(draft, command.payload.link.toEventId, scopeEventId)
      )
    case "journey.retire_link":
      return isScopeLink(draft, command.payload.linkId, scopeEventId)
    case "journey.select_branch":
      return (
        isScopeEvent(draft, command.payload.forkEventId, scopeEventId) &&
        isScopeLink(draft, command.payload.selectedLinkId, scopeEventId)
      )
    default:
      return false
  }
}

function repairTargetsIssue(
  command: ReturnType<typeof targetCommandBodySchema.parse>,
  issue: PlanValidationReport["issues"][number],
  draft: PreparedAgentDraft
) {
  if (issue.code === "ROOT_ROUTE_DISCONNECTED" && issue.eventIds.length === 0) {
    return isRootCityInsertion(command)
  }
  if (issue.code === "PROJECTION_INVALID") {
    return projectionRepairTargetsScope(
      command,
      draft,
      issue.cityEventId ?? null
    )
  }
  const eventIds = new Set(issue.eventIds)
  const touchesEvent = (eventId: string) => eventIds.has(eventId)
  const touchesLink = (linkId: string) => {
    const link = draft.after.links.find((candidate) => candidate.id === linkId)
    return Boolean(
      link && (touchesEvent(link.fromEventId) || touchesEvent(link.toEventId))
    )
  }

  switch (command.name) {
    case "journey.add_event":
      return positionTouchesIssue(command.payload.position, eventIds)
    case "journey.update_event":
    case "journey.move_event":
    case "journey.place_event":
    case "journey.retire_event":
    case "journey.plan_transit":
    case "journey.select_transit_plan":
      return touchesEvent(command.payload.eventId)
    case "journey.replace_event":
      return touchesEvent(command.payload.predecessorEventId)
    case "journey.add_link":
      return (
        touchesEvent(command.payload.link.fromEventId) ||
        touchesEvent(command.payload.link.toEventId)
      )
    case "journey.retire_link":
      return touchesLink(command.payload.linkId)
    case "journey.select_branch":
      return (
        touchesEvent(command.payload.forkEventId) ||
        touchesLink(command.payload.selectedLinkId)
      )
    default:
      return false
  }
}

function conversationMessages(
  document: NonNullable<
    Awaited<ReturnType<WorkspaceCommandService["getDocument"]>>
  >
): AgentConversationMessage[] {
  return document.messages
    .filter((message) => message.role !== "SYSTEM")
    .map((message) => ({
      id: message.id,
      role: message.role === "USER" ? "user" : "assistant",
      content: message.content,
      runId: message.agentRunId ?? null,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    }))
}

function draftPrompt(
  messages: AgentConversationMessage[],
  mode: AgentMode,
  snapshot: unknown
) {
  return buildPrompt(messages, mode, JSON.stringify(snapshot, null, 2))
}

export class AgentGateway {
  private readonly runs = new Map<string, RunningAgent>()
  private readonly runsByCapability = new Map<string, RunningAgent>()
  private readonly runtimeOwnerId: string
  private readonly agentRunLeaseSeconds: number
  private readonly heartbeatIntervalMs: number | null
  private readonly now: () => Date
  private readonly placeService: NonNullable<
    AgentGatewayOptions["placeService"]
  >
  private readonly hotelService: NonNullable<
    AgentGatewayOptions["hotelService"]
  >

  constructor(
    private readonly commands: WorkspaceCommandService,
    private readonly runtime: AgentRuntime,
    private readonly options: AgentGatewayOptions
  ) {
    this.runtimeOwnerId = options.runtimeOwnerId ?? randomUUID()
    this.agentRunLeaseSeconds =
      options.agentRunLeaseSeconds ?? WORKSPACE_AGENT_RUN_LEASE_SECONDS
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs === undefined
        ? Math.max(1_000, Math.floor((this.agentRunLeaseSeconds * 1000) / 3))
        : options.heartbeatIntervalMs
    this.now = options.now ?? (() => new Date())
    this.placeService = options.placeService ?? createPlaceIntelligenceService()
    this.hotelService = options.hotelService ?? createHotelSearchService()
  }

  private async trace(
    running: RunningAgent,
    input: Omit<EvalTraceInput, "runId" | "scenarioId" | "workspaceId">
  ) {
    if (!this.options.evalTrace || running.traceFailure) return false
    try {
      await this.options.evalTrace.sink.emit({
        ...input,
        runId: running.runId,
        scenarioId: this.options.evalTrace.scenarioId,
        workspaceId: running.workspaceId,
      })
      return true
    } catch (error) {
      running.traceFailure =
        error instanceof Error ? error : new Error("Eval trace write failed")
      return false
    }
  }

  private async withTelemetrySpan<T>(
    telemetry: AgentRunTelemetry,
    name: string,
    callback: () => Promise<T>,
    attributes: Record<string, string | number | boolean> = {}
  ) {
    const span = telemetry.startSpan(
      name,
      OpenInferenceSpanKind.CHAIN,
      attributes
    )
    try {
      const result = await telemetry.withSpan(span, callback)
      span.end("OK")
      return result
    } catch (error) {
      span.recordException(error)
      span.end("ERROR")
      throw error
    }
  }

  private finishRejectedTelemetry(
    telemetry: AgentRunTelemetry,
    code: string,
    message: string
  ) {
    const rejectionSpan = telemetry.startSpan(
      "agent.run.rejection",
      OpenInferenceSpanKind.CHAIN,
      { "periplus.agent.rejection_code": code }
    )
    rejectionSpan.end("ERROR", {
      "error.message": message,
      "periplus.agent.rejected": true,
    })
    telemetry.finish("ERROR", message, {
      "periplus.agent.rejection_code": code,
      "periplus.agent.rejected": true,
    })
  }

  async start(
    context: AuthContext,
    workspaceId: string,
    prompt: string,
    mode: AgentMode,
    emit: AgentEventEmitter
  ) {
    const runId = randomUUID()
    const telemetry = startAgentRunTelemetry({
      workspaceId,
      userId: context.userId,
      runId,
      mode,
      runtimeId: this.runtime.id,
      promptVersion: promptVersion(mode),
    })
    telemetry.setPromptInput(prompt)

    let initial
    try {
      initial = await this.withTelemetrySpan(
        telemetry,
        "agent.workspace.load",
        () => this.commands.getDocument(context, workspaceId)
      )
      if (!initial) throw new WorkspaceInputError("Workspace was not found")
    } catch (error) {
      this.finishRejectedTelemetry(
        telemetry,
        "WORKSPACE_LOAD_FAILED",
        error instanceof Error ? error.message : "Workspace was not found"
      )
      throw error
    }
    if (this.runs.has(workspaceId)) {
      this.finishRejectedTelemetry(
        telemetry,
        "LOCAL_RUN_ALREADY_ACTIVE",
        "当前 Workspace 正在由 Agent 修改"
      )
      emit(workspaceId, {
        type: "error",
        payload: { message: "当前 Workspace 正在由 Agent 修改" },
      })
      return
    }
    if (initial.agentRuns.some((run) => run.status === "RUNNING")) {
      try {
        await this.withTelemetrySpan(
          telemetry,
          "agent.run.acquire.reconcile",
          () =>
            reconcileExpiredWorkspaceAgentRun(
              context,
              workspaceId,
              this.runtimeOwnerId,
              this.now()
            )
        )
        initial = await this.withTelemetrySpan(
          telemetry,
          "agent.workspace.load",
          () => this.commands.getDocument(context, workspaceId)
        )
        if (!initial) throw new WorkspaceInputError("Workspace was not found")
      } catch (error) {
        this.finishRejectedTelemetry(
          telemetry,
          "RUN_ACQUIRE_FAILED",
          error instanceof Error ? error.message : "Workspace was not found"
        )
        throw error
      }
      if (initial.agentRuns.some((run) => run.status === "RUNNING")) {
        this.finishRejectedTelemetry(
          telemetry,
          "RUN_ALREADY_ACTIVE",
          "当前 Workspace 正在由 Agent 修改"
        )
        emit(workspaceId, {
          type: "error",
          payload: { message: "当前 Workspace 正在由 Agent 修改" },
        })
        return
      }
    }

    let persistedRun
    try {
      persistedRun = await this.withTelemetrySpan(
        telemetry,
        "agent.run.persist",
        () =>
          startWorkspaceAgentRun(
            context,
            workspaceId,
            this.now(),
            this.runtimeOwnerId,
            this.agentRunLeaseSeconds,
            runId
          )
      )
      if (!persistedRun)
        throw new WorkspaceInputError("Workspace was not found")
    } catch (error) {
      this.finishRejectedTelemetry(
        telemetry,
        "RUN_PERSIST_REJECTED",
        error instanceof Error ? error.message : "Workspace was not found"
      )
      throw error
    }
    telemetry.root.addEvent("agent.run.persisted")
    let assistantMessageId: string
    try {
      const userMessageSpan = telemetry.startSpan(
        "workspace.message.user.persist",
        OpenInferenceSpanKind.CHAIN,
        { "periplus.message.role": "user" }
      )
      let userMessage
      try {
        userMessage = await telemetry.withSpan(userMessageSpan, () =>
          appendWorkspaceMessage(context, workspaceId, {
            role: "USER",
            content: prompt,
          })
        )
        userMessageSpan.end("OK", {
          "periplus.message.length": prompt.length,
          ...(userMessage ? { "periplus.message.id": userMessage.id } : {}),
        })
      } catch (error) {
        userMessageSpan.recordException(error)
        userMessageSpan.end("ERROR")
        throw error
      }

      const assistantMessageSpan = telemetry.startSpan(
        "workspace.message.assistant.persist",
        OpenInferenceSpanKind.CHAIN,
        { "periplus.message.role": "assistant" }
      )
      let assistantMessage
      try {
        assistantMessage = await telemetry.withSpan(assistantMessageSpan, () =>
          appendWorkspaceMessage(context, workspaceId, {
            role: "ASSISTANT",
            content: "",
            agentRunId: persistedRun.id,
          })
        )
        assistantMessageSpan.end("OK", {
          ...(assistantMessage
            ? { "periplus.message.id": assistantMessage.id }
            : {}),
        })
      } catch (error) {
        assistantMessageSpan.recordException(error)
        assistantMessageSpan.end("ERROR")
        throw error
      }
      if (!assistantMessage) {
        throw new WorkspaceInputError("Assistant message could not be created")
      }
      assistantMessageId = assistantMessage.id
    } catch (error) {
      try {
        await this.withTelemetrySpan(
          telemetry,
          "agent.run.finish.persist",
          () =>
            finishWorkspaceAgentRun(context, workspaceId, persistedRun.id, {
              status: "FAILED",
              errorCode: "AGENT_MESSAGE_FAILED",
              errorMessage:
                error instanceof Error ? error.message : "User message failed",
              runtimeOwnerId: this.runtimeOwnerId,
              now: this.now(),
            })
        )
      } catch {
        // Preserve the original persistence failure if terminalization fails.
      }
      telemetry.finish(
        "ERROR",
        error instanceof Error ? error.message : "User message failed"
      )
      throw error
    }
    const capabilityToken = randomUUID()
    const running: RunningAgent = {
      workspaceId,
      context,
      runId: persistedRun.id,
      capabilityToken,
      runtimeRun: null,
      cancelled: false,
      finished: false,
      runtimeFailed: false,
      stdout: "",
      assistantMessageId,
      outputWrite: Promise.resolve(),
      heartbeatTimer: null,
      traceRunSpanId: randomUUID(),
      traceFailure: null,
      telemetry,
      requiresPlanValidation: false,
      lastPlanValidation: null,
      hotelStayState: { kind: "not_searched" },
      verifiedPlaces: new Map(),
      drafts: new Map(),
      draftRequests: new Map(),
      draftHotelSelections: new Map(),
      latestDraftId: null,
      draftValidationAttempts: 0,
    }
    this.runs.set(workspaceId, running)
    this.runsByCapability.set(capabilityToken, running)
    this.startHeartbeat(running)

    try {
      await this.trace(running, {
        type: "run.started",
        spanId: running.traceRunSpanId,
        status: "OK",
        payload: { mode, runtimeId: this.runtime.id },
      })
      const document = await this.withTelemetrySpan(
        running.telemetry,
        "agent.workspace.lock.load",
        () => this.commands.getDocument(context, workspaceId)
      )
      if (!document) throw new WorkspaceInputError("Workspace was not found")
      emit(workspaceId, { type: "workspace.locked", payload: document })
      emit(workspaceId, {
        type: "agent.run.started",
        payload: {
          runId: running.runId,
          runtimeId: this.runtime.id,
          ...(running.telemetry.traceId
            ? { traceId: running.telemetry.traceId }
            : {}),
        },
      })
      const promptSpan = running.telemetry.startSpan(
        "agent.prompt.build",
        OpenInferenceSpanKind.PROMPT,
        { "periplus.prompt.version": promptVersion(mode) }
      )
      const runtimePrompt = draftPrompt(
        conversationMessages(document),
        mode,
        document
      )
      promptSpan.end("OK", {
        "periplus.prompt.length": runtimePrompt.length,
      })
      running.telemetry.setPromptInput(runtimePrompt)

      const runtimeStartSpan = running.telemetry.startSpan(
        "agent.runtime.start",
        OpenInferenceSpanKind.CHAIN,
        {
          "periplus.agent.runtime": this.runtime.id,
          "periplus.agent.mode": mode,
        }
      )
      const runtimeStreamSpan = running.telemetry.startRuntimeStream(
        runtimeStartSpan.context
      )
      let runtimeRun
      try {
        runtimeRun = await running.telemetry.withSpan(runtimeStartSpan, () =>
          this.runtime.start(
            {
              runId: running.runId,
              prompt: runtimePrompt,
              traceCarrier: running.telemetry.carrierFor(runtimeStreamSpan),
              toolServers: this.toolServers(running, mode),
            },
            {
              onStdout: (text) => {
                running.telemetry.recordStreamDelta(text)
                this.persistStdout(running, text, emit)
              },
              onStderr: (text) => {
                this.heartbeatInBackground(running)
                emit(workspaceId, {
                  type: "agent.message.delta",
                  payload: { runId: running.runId, stream: "stderr", text },
                })
              },
              onError: (error) => {
                running.runtimeFailed = true
                running.telemetry.recordRuntimeError(error.name)
                running.telemetry.root.addEvent("runtime.error", {
                  "error.type": error.name,
                })
                emit(workspaceId, {
                  type: "agent.run.failed",
                  payload: { runId: running.runId, message: error.message },
                })
              },
              onModelTelemetry: (event) => {
                const modelSpan = running.telemetry.startSpan(
                  "llm.request",
                  OpenInferenceSpanKind.LLM,
                  {
                    "llm.provider": event.provider,
                    "llm.model_name": event.model,
                    [PROMPT_TEMPLATE_VERSION]: promptVersion(mode),
                    ...(event.inputTokens === undefined
                      ? {}
                      : { "llm.token_count.prompt": event.inputTokens }),
                    ...(event.outputTokens === undefined
                      ? {}
                      : { "llm.token_count.completion": event.outputTokens }),
                    ...(event.cacheReadTokens === undefined
                      ? {}
                      : {
                          "llm.token_count.cache_read": event.cacheReadTokens,
                        }),
                    ...(event.cacheWriteTokens === undefined
                      ? {}
                      : {
                          "llm.token_count.cache_write": event.cacheWriteTokens,
                        }),
                  },
                  runtimeStreamSpan.context
                )
                modelSpan.end("OK")
              },
              onExit: (result) => {
                void this.finish(running, mode, result, emit)
              },
            }
          )
        )
        runtimeStartSpan.end("OK")
      } catch (error) {
        runtimeStartSpan.end("ERROR", {
          "error.type": error instanceof Error ? error.name : "Error",
        })
        throw error
      }
      running.runtimeRun = runtimeRun
      if (running.cancelled) runtimeRun.cancel()
    } catch (error) {
      await this.failToStart(running, error, emit)
    }
  }

  cancel(workspaceId: string) {
    const running = this.runs.get(workspaceId)
    if (!running || running.finished) return
    running.cancelled = true
    running.runtimeRun?.cancel()
  }

  async executeTool(
    capabilityToken: string,
    request: Extract<AgentToolRequest, { type: "workspace.get" }>
  ): Promise<{
    workspace: NonNullable<
      Awaited<ReturnType<WorkspaceCommandService["getDocument"]>>
    >
  }>
  async executeTool(
    capabilityToken: string,
    request: Extract<AgentToolRequest, { type: "workspace.project" }>
  ): Promise<{
    projection: ReturnType<typeof resolveJourneyProjection>
    headWorkspaceRevision: number
  }>
  async executeTool(
    capabilityToken: string,
    request: Extract<AgentToolRequest, { type: "workspace.validate_plan" }>
  ): Promise<PlanValidationReport>
  async executeTool(
    capabilityToken: string,
    request: Extract<AgentToolRequest, { type: "workspace.validate_draft" }>
  ): Promise<{
    draftId: string
    validation: PlanValidationReport
    repairsRemaining: number
  }>
  async executeTool(
    capabilityToken: string,
    request: Extract<AgentToolRequest, { type: "workspace.commit_draft" }>
  ): Promise<{
    result: Awaited<ReturnType<WorkspaceCommandService["commitAgentDraft"]>>
    workspace: Awaited<ReturnType<WorkspaceCommandService["getDocument"]>>
  }>
  async executeTool(
    capabilityToken: string,
    request: Extract<AgentToolRequest, { type: "workspace.prepare_transit" }>
  ): Promise<{
    draftId: string
    validation: PlanValidationReport
    repairsRemaining: number
  }>
  async executeTool(
    capabilityToken: string,
    request: Extract<AgentToolRequest, { type: "workspace.command" }>
  ): Promise<{
    result: Awaited<ReturnType<WorkspaceCommandService["execute"]>>
    workspace: Awaited<ReturnType<WorkspaceCommandService["getDocument"]>>
  }>
  async executeTool(
    capabilityToken: string,
    request: PlaceAgentToolRequest
  ): Promise<unknown>
  async executeTool(
    capabilityToken: string,
    request: HotelAgentToolRequest
  ): Promise<unknown>
  async executeTool(
    capabilityToken: string,
    request: AgentToolRequest
  ): Promise<unknown>
  async executeTool(capabilityToken: string, request: AgentToolRequest) {
    const running = this.runsByCapability.get(capabilityToken)
    if (!running || running.finished) {
      throw new WorkspaceInputError(
        "Agent tool capability is invalid or expired"
      )
    }
    const toolSpanId = randomUUID()
    const commandSpanId =
      request.type === "workspace.command" ? randomUUID() : undefined
    const commandId =
      request.type === "workspace.command"
        ? `${running.runId}:${request.idempotencyKey}`
        : undefined
    const startedAt = performance.now()
    const commandName =
      request.type === "workspace.command" &&
      request.command != null &&
      typeof request.command === "object" &&
      "name" in request.command &&
      typeof request.command.name === "string"
        ? request.command.name
        : undefined
    const otelToolSpan = running.telemetry.startSpan(
      "agent.tool",
      OpenInferenceSpanKind.TOOL,
      {
        [TOOL_NAME]: request.type,
      },
      otelContext.active()
    )
    otelToolSpan.setAttribute("input.value", redactedInput(request) ?? "")
    const otelCommandSpan =
      request.type === "workspace.command"
        ? running.telemetry.startSpan(
            "workspace.command",
            OpenInferenceSpanKind.CHAIN,
            {
              "periplus.command.name": commandName ?? "invalid",
              "periplus.command.idempotency_key": request.idempotencyKey,
            },
            otelToolSpan.context
          )
        : null
    if (otelCommandSpan && request.type === "workspace.command") {
      otelCommandSpan.setAttribute(
        "input.value",
        redactedInput(request.command) ?? ""
      )
    }
    const otelDraftSpan =
      request.type === "workspace.validate_draft" ||
      request.type === "workspace.commit_draft" ||
      request.type === "workspace.prepare_transit"
        ? running.telemetry.startSpan(
            request.type,
            OpenInferenceSpanKind.CHAIN,
            {},
            otelToolSpan.context
          )
        : null
    if (otelDraftSpan) {
      otelDraftSpan.setAttribute("input.value", redactedInput(request) ?? "")
    }
    await this.trace(running, {
      type: "tool.started",
      spanId: toolSpanId,
      parentSpanId: running.traceRunSpanId,
      status: "OK",
      payload: {
        toolType: request.type,
        ...(isEvidenceToolRequest(request)
          ? {
              requestId: (
                request as PlaceAgentToolRequest | HotelAgentToolRequest
              ).requestId,
            }
          : {}),
        ...(commandName ? { commandName } : {}),
      },
    })
    if (request.type === "workspace.command" && commandSpanId) {
      await this.trace(running, {
        type: "command.dispatched",
        spanId: commandSpanId,
        parentSpanId: toolSpanId,
        commandId,
        revisionBefore: request.expectedRevision,
        status: "OK",
        payload: {
          commandName: commandName ?? "invalid",
          idempotencyKey: request.idempotencyKey,
          commandHash: evalContentHash(request.command),
        },
      })
    }

    try {
      await this.heartbeat(running)
      let output: unknown
      if (request.type === "workspace.get") {
        const document = await this.commands.getDocument(
          running.context,
          running.workspaceId
        )
        if (!document) throw new WorkspaceInputError("Workspace was not found")
        output = { workspace: document }
      } else if (request.type === "workspace.project") {
        const document = await this.commands.getDocument(
          running.context,
          running.workspaceId
        )
        if (!document) throw new WorkspaceInputError("Workspace was not found")
        output = {
          projection: resolveJourneyProjection({
            graph: document.session.headGraph,
            scopeSectionEventId: request.scopeSectionEventId,
            mode: request.mode,
            asOfRevision: request.asOfRevision,
          }),
          headWorkspaceRevision: document.session.headWorkspaceRevision,
        }
      } else if (request.type === "workspace.validate_plan") {
        const document = await this.commands.getDocument(
          running.context,
          running.workspaceId
        )
        if (!document) throw new WorkspaceInputError("Workspace was not found")
        if (
          document.session.headWorkspaceRevision !== request.expectedRevision
        ) {
          throw new WorkspaceRevisionConflictError()
        }
        const validationSpan = running.telemetry.startSpan(
          "workspace.validate_plan",
          OpenInferenceSpanKind.CHAIN,
          {},
          otelToolSpan.context
        )
        const validation = validateJourneyPlan({
          graph: document.session.headGraph,
          workspaceRevision: document.session.headWorkspaceRevision,
        })
        validationSpan.end("OK", {
          "periplus.validation.valid": validation.valid,
          "periplus.workspace.revision": validation.workspaceRevision,
        })
        running.lastPlanValidation = validation
        await this.trace(running, {
          type: "validator.completed",
          spanId: randomUUID(),
          parentSpanId: toolSpanId,
          status: "OK",
          payload: {
            valid: validation.valid,
            issueCodes: validation.issues.map((issue) => issue.code),
            projectionHash: validation.projectionHash,
            workspaceRevision: validation.workspaceRevision,
          },
        })
        output = validation
      } else if (request.type === "workspace.validate_draft") {
        const existingDraft = running.drafts.get(request.idempotencyKey)
        const requestFingerprint = JSON.stringify({
          expectedRevision: request.expectedRevision,
          previousDraftId: request.previousDraftId ?? null,
          commands: request.commands,
        })
        if (
          existingDraft &&
          running.draftRequests.get(request.idempotencyKey) !==
            requestFingerprint
        ) {
          throw new WorkspaceInputError(
            "Draft idempotency key was already used for a different request"
          )
        }
        if (!existingDraft && running.draftValidationAttempts >= 3) {
          throw new WorkspaceInputError(
            "Journey draft has exhausted its two repair attempts"
          )
        }
        let baseDraft: PreparedAgentDraft | undefined
        if (!existingDraft && running.draftValidationAttempts > 0) {
          if (request.previousDraftId !== running.latestDraftId) {
            throw new WorkspaceInputError(
              "Repair draft must reference the latest invalid draft"
            )
          }
          const previousDraft = running.drafts.get(request.previousDraftId)
          if (!previousDraft || previousDraft.validation.valid) {
            throw new WorkspaceInputError(
              "Repair draft must reference a previous invalid draft"
            )
          }
          baseDraft = previousDraft
          const issues = previousDraft.validation.issues.filter(
            (issue) => issue.severity === "ERROR"
          )
          for (const command of request.commands) {
            const parsed = targetCommandBodySchema.parse(command)
            const allowed = issues.some(
              (issue) =>
                issue.allowedOperations.includes(parsed.name) &&
                repairTargetsIssue(parsed, issue, previousDraft)
            )
            if (!allowed) {
              throw new WorkspaceInputError(
                `Repair command ${parsed.name} does not target a previous draft issue`
              )
            }
          }
        } else if (!existingDraft && request.previousDraftId) {
          throw new WorkspaceInputError(
            "Initial draft must not reference a previous draft"
          )
        }
        const draft =
          existingDraft ??
          (await (async () => {
            const parsedCommands = request.commands.map((command) =>
              targetCommandBodySchema.parse(command)
            )
            const hotel = draftCommandsWithSelectedHotel(
              running,
              parsedCommands,
              Boolean(
                request.previousDraftId &&
                running.draftHotelSelections.has(request.previousDraftId)
              )
            )
            const prepared = await running.telemetry.withSpan(
              otelDraftSpan ?? otelToolSpan,
              () =>
                this.commands.prepareAgentDraft(running.context, {
                  workspaceId: running.workspaceId,
                  expectedRevision: request.expectedRevision,
                  idempotencyKey: request.idempotencyKey,
                  actor: { kind: "AGENT", agentRunId: running.runId },
                  commands: hotel.commands,
                  baseDraft,
                  verifiedPlaces: Array.from(running.verifiedPlaces.values()),
                })
            )
            const inheritedHotel = request.previousDraftId
              ? running.draftHotelSelections.get(request.previousDraftId)
              : undefined
            const selection = hotel.selection ?? inheritedHotel
            if (selection) {
              running.draftHotelSelections.set(
                request.idempotencyKey,
                selection
              )
            }
            return prepared
          })())
        if (!existingDraft) {
          running.draftValidationAttempts += 1
          running.drafts.set(request.idempotencyKey, draft)
          running.draftRequests.set(request.idempotencyKey, requestFingerprint)
          running.latestDraftId = request.idempotencyKey
        }
        const repairsUsed = Math.max(0, running.draftValidationAttempts - 1)
        otelDraftSpan?.setAttributes({
          "periplus.validation.valid": draft.validation.valid,
          "periplus.validation.issue_count": draft.validation.issues.length,
          "periplus.draft.repairs_used": repairsUsed,
          "periplus.workspace.revision": draft.validation.workspaceRevision,
        })
        await this.trace(running, {
          type: "validator.completed",
          spanId: randomUUID(),
          parentSpanId: toolSpanId,
          status: "OK",
          payload: {
            valid: draft.validation.valid,
            issueCodes: draft.validation.issues.map((issue) => issue.code),
            projectionHash: draft.validation.projectionHash,
            workspaceRevision: draft.validation.workspaceRevision,
            draft: true,
            repairsUsed,
          },
        })
        output = {
          draftId: request.idempotencyKey,
          validation: draft.validation,
          repairsRemaining: Math.max(0, 2 - repairsUsed),
        }
      } else if (request.type === "workspace.commit_draft") {
        const draft = running.drafts.get(request.draftId)
        if (!draft) {
          throw new WorkspaceInputError(
            "Draft was not validated in this Agent run"
          )
        }
        const hotelSelection = running.draftHotelSelections.get(request.draftId)
        if (hotelSelection) {
          const state = running.hotelStayState
          const isReplay =
            state.kind === "consumed" &&
            state.idempotencyKey === request.draftId &&
            state.selection.candidate.candidateId ===
              hotelSelection.candidate.candidateId
          if (
            !isReplay &&
            (state.kind !== "available" ||
              state.selection.candidate.candidateId !==
                hotelSelection.candidate.candidateId)
          ) {
            throw new WorkspaceInputError("酒店检索每次只能写入首位候选一次")
          }
        }
        const result = await running.telemetry.withSpan(
          otelDraftSpan ?? otelToolSpan,
          () => this.commands.commitAgentDraft(running.context, draft)
        )
        otelDraftSpan?.setAttributes({
          "periplus.command.name": result.commandName,
          "periplus.command.replayed": Boolean(
            result.replayedFromIdempotencyKey
          ),
          "periplus.workspace.revision": result.newRevision,
        })
        if (hotelSelection && running.hotelStayState.kind === "available") {
          running.hotelStayState = {
            kind: "consumed",
            selection: hotelSelection,
            idempotencyKey: request.draftId,
          }
        }
        running.requiresPlanValidation = true
        const document = await this.commands.getDocument(
          running.context,
          running.workspaceId
        )
        if (!document) throw new WorkspaceInputError("Workspace was not found")
        if (document.session.headWorkspaceRevision !== result.newRevision) {
          throw new WorkspaceRevisionConflictError()
        }
        running.lastPlanValidation = validateJourneyPlan({
          graph: document.session.headGraph,
          workspaceRevision: document.session.headWorkspaceRevision,
        })
        output = { result, workspace: document }
      } else if (request.type === "workspace.prepare_transit") {
        const existingDraft = running.drafts.get(request.idempotencyKey)
        const requestFingerprint = JSON.stringify({
          previousDraftId: request.previousDraftId,
          eventId: request.eventId,
          kind: "prepare_transit",
        })
        if (
          existingDraft &&
          running.draftRequests.get(request.idempotencyKey) !==
            requestFingerprint
        ) {
          throw new WorkspaceInputError(
            "Draft idempotency key was already used for a different request"
          )
        }
        if (!existingDraft && running.draftValidationAttempts >= 3) {
          throw new WorkspaceInputError(
            "Journey draft has exhausted its two repair attempts"
          )
        }
        const draft =
          existingDraft ??
          (await (async () => {
            if (request.previousDraftId !== running.latestDraftId) {
              throw new WorkspaceInputError(
                "Transit preparation must reference the latest invalid draft"
              )
            }
            const previous = running.drafts.get(request.previousDraftId)
            if (!previous || previous.validation.valid) {
              throw new WorkspaceInputError(
                "Transit preparation must reference a previous invalid draft"
              )
            }
            const allowed = previous.validation.issues
              .filter((issue) => issue.severity === "ERROR")
              .some(
                (issue) =>
                  issue.allowedOperations.includes("journey.plan_transit") &&
                  issue.eventIds.includes(request.eventId)
              )
            if (!allowed) {
              throw new WorkspaceInputError(
                "Transit preparation is not allowed by the previous draft issues"
              )
            }
            const prepared = await running.telemetry.withSpan(
              otelDraftSpan ?? otelToolSpan,
              () =>
                this.commands.prepareAgentTransit(running.context, {
                  draft: previous,
                  idempotencyKey: request.idempotencyKey,
                  eventId: request.eventId,
                  verifiedPlaces: Array.from(running.verifiedPlaces.values()),
                })
            )
            const selection = running.draftHotelSelections.get(
              request.previousDraftId
            )
            if (selection) {
              running.draftHotelSelections.set(
                request.idempotencyKey,
                selection
              )
            }
            return prepared
          })())
        if (!existingDraft) {
          running.draftValidationAttempts += 1
          running.drafts.set(request.idempotencyKey, draft)
          running.draftRequests.set(request.idempotencyKey, requestFingerprint)
          running.latestDraftId = request.idempotencyKey
        }
        const repairsUsed = Math.max(0, running.draftValidationAttempts - 1)
        otelDraftSpan?.setAttributes({
          "periplus.validation.valid": draft.validation.valid,
          "periplus.validation.issue_count": draft.validation.issues.length,
          "periplus.draft.repairs_used": repairsUsed,
          "periplus.workspace.revision": draft.validation.workspaceRevision,
        })
        output = {
          draftId: request.idempotencyKey,
          validation: draft.validation,
          repairsRemaining: Math.max(0, 2 - repairsUsed),
        }
      } else if (isPlaceToolRequest(request)) {
        output = await this.executePlaceTool(running, request, otelToolSpan)
      } else if (request.type === "hotel.search") {
        output = await this.executeHotelTool(running, request, otelToolSpan)
      } else {
        throw new WorkspaceInputError(
          "Agent direct Workspace commands are disabled; use validate_draft and commit_draft"
        )
      }

      if (isEvidenceToolRequest(request)) {
        await this.trace(running, {
          type: "evidence.recorded",
          spanId: randomUUID(),
          parentSpanId: toolSpanId,
          status: "OK",
          payload: {
            evidenceId: `${running.runId}:${request.requestId}`,
            toolType: request.type,
            requestId: request.requestId,
            contentHash: evalContentHash(output),
            ...(output != null &&
            typeof output === "object" &&
            "status" in output &&
            typeof output.status === "string"
              ? { resultStatus: output.status }
              : {}),
          },
        })
      }
      await this.trace(running, {
        type: "tool.completed",
        spanId: toolSpanId,
        parentSpanId: running.traceRunSpanId,
        durationMs: performance.now() - startedAt,
        status: "OK",
        payload: {
          toolType: request.type,
          outputHash: evalContentHash(output),
        },
      })
      otelToolSpan.setAttribute("output.value", redactedInput(output) ?? "")
      otelDraftSpan?.setAttribute("output.value", redactedInput(output) ?? "")
      otelDraftSpan?.end("OK")
      running.telemetry.recordTool(
        request.type,
        request.type.startsWith("place.")
          ? "amap"
          : request.type === "hotel.search"
            ? "rollinggo"
            : "workspace",
        "OK",
        performance.now() - startedAt
      )
      otelToolSpan.end("OK", {
        "periplus.tool.duration_ms": performance.now() - startedAt,
      })
      return output
    } catch (error) {
      otelCommandSpan?.end("ERROR", {
        "error.type": error instanceof Error ? error.name : "Error",
      })
      otelDraftSpan?.recordException(error)
      otelDraftSpan?.end("ERROR", {
        "error.type": error instanceof Error ? error.name : "Error",
      })
      if (request.type === "workspace.command" && commandSpanId) {
        await this.trace(running, {
          type: "command.rejected",
          spanId: commandSpanId,
          parentSpanId: toolSpanId,
          commandId,
          revisionBefore: request.expectedRevision,
          status: "ERROR",
          payload: {
            commandName: commandName ?? "invalid",
            errorName: error instanceof Error ? error.name : "Error",
            errorMessage:
              error instanceof Error ? error.message : "Command failed",
          },
        })
      }
      await this.trace(running, {
        type: "tool.failed",
        spanId: toolSpanId,
        parentSpanId: running.traceRunSpanId,
        durationMs: performance.now() - startedAt,
        status: "ERROR",
        payload: {
          toolType: request.type,
          errorName: error instanceof Error ? error.name : "Error",
          errorMessage:
            error instanceof Error ? error.message : "Agent tool failed",
        },
      })
      running.telemetry.recordTool(
        request.type,
        request.type.startsWith("place.")
          ? "amap"
          : request.type === "hotel.search"
            ? "rollinggo"
            : "workspace",
        "ERROR",
        performance.now() - startedAt
      )
      otelToolSpan.end("ERROR", {
        "error.type": error instanceof Error ? error.name : "Error",
        "periplus.tool.duration_ms": performance.now() - startedAt,
      })
      throw error
    }
  }

  private async executePlaceTool(
    running: RunningAgent,
    request: PlaceAgentToolRequest,
    parentSpan: TelemetrySpan
  ) {
    const usageContext: PlaceProviderUsageContext = {
      userId: running.context.userId,
      workspaceId: running.workspaceId,
      agentRunId: running.runId,
      requestId: request.requestId,
    }
    if (request.type === "place.search") {
      const input = withoutRequestId(
        placeSearchInputSchema.parse({
          ...asInputRecord(request.input),
          requestId: request.requestId,
        })
      )
      const result = await this.withProviderSpan(
        running,
        parentSpan,
        "amap",
        "place.search",
        () => this.placeService.searchPlaces(input, usageContext)
      )
      if (isAttractionSearch(input)) {
        const candidates = result.results.filter((candidate) =>
          isAttractionCategory(candidate.category)
        )
        if (candidates.length) {
          await appendWorkspaceMessage(running.context, running.workspaceId, {
            role: "ASSISTANT",
            content: "",
            blocks: [
              {
                type: "place_search",
                title: `${input.query ?? input.city ?? "地点"}地点`,
                fetchedAt: new Date().toISOString(),
                candidates: candidates.map((candidate) => ({
                  candidateId: candidate.id,
                  name: candidate.name,
                  category: candidate.category,
                  address: candidate.address,
                  imageUrl: candidate.images?.[0]?.url,
                })),
              },
            ],
            agentRunId: running.runId,
          })
        }
      }
      return result
    }
    if (request.type === "place.resolve") {
      const input = withoutRequestId(
        placeResolveInputSchema.parse({
          ...asInputRecord(request.input),
          requestId: request.requestId,
        })
      )
      const result = await this.withProviderSpan(
        running,
        parentSpan,
        "amap",
        "place.resolve",
        () => this.placeService.resolvePlace(input, usageContext)
      )
      if (result.status === "resolved") {
        const verification = { ref: result.placeRef }
        running.verifiedPlaces.set(
          placeVerificationKey(verification),
          verification
        )
      }
      return result
    }
    if (request.type === "place.enrich") {
      const input = withoutRequestId(
        placeEnrichInputSchema.parse({
          ...asInputRecord(request.input),
          requestId: request.requestId,
        })
      )
      return this.withProviderSpan(
        running,
        parentSpan,
        "amap",
        "place.enrich",
        () => this.placeService.enrichPlace(input, usageContext)
      )
    }

    const input = withoutRequestId(
      placeResolveForJourneyEventInputSchema.parse({
        ...asInputRecord(request.input),
        requestId: request.requestId,
      })
    )
    const document = await this.commands.getDocument(
      running.context,
      running.workspaceId
    )
    if (!document) throw new WorkspaceInputError("Workspace was not found")
    const event = document.session.headGraph.events.find(
      (candidate) => candidate.id === input.eventId
    )
    if (
      !event ||
      (event.retiredRevision != null &&
        event.retiredRevision <= document.session.headGraph.revision)
    ) {
      throw new WorkspaceInputError(
        "Place target must be an active event in the current Workspace"
      )
    }
    if (
      event.type !== "VISIT" &&
      event.type !== "STAY" &&
      event.type !== "MEAL" &&
      event.type !== "ACTIVITY"
    ) {
      throw new WorkspaceInputError(
        "Place target must be a VISIT, STAY, MEAL, or ACTIVITY event"
      )
    }
    const result = await this.withProviderSpan(
      running,
      parentSpan,
      "amap",
      "place.resolve_for_journey_event",
      () =>
        this.placeService.resolvePlaceForJourneyEvent(
          input,
          event.type,
          usageContext
        )
    )
    if (result.status === "ready") {
      const coverImage = selectedCoverImage(result)
      const verification = {
        ref: result.placeRef,
        ...(coverImage ? { coverImage } : {}),
      }
      running.verifiedPlaces.set(
        placeVerificationKey(verification),
        verification
      )
    }
    return result
  }

  private async executeHotelTool(
    running: RunningAgent,
    request: HotelAgentToolRequest,
    parentSpan: TelemetrySpan
  ) {
    const input = withoutRequestId(
      hotelSearchInputSchema.parse({
        ...asInputRecord(request.input),
        requestId: request.requestId,
      })
    )
    const usageContext: HotelProviderUsageContext = {
      userId: running.context.userId,
      workspaceId: running.workspaceId,
      agentRunId: running.runId,
      requestId: request.requestId,
    }
    const result = await this.withProviderSpan(
      running,
      parentSpan,
      "rollinggo",
      "hotel.search",
      () => this.hotelService.searchHotels(input, usageContext)
    )
    const firstCandidate = result.candidates[0]
    const stayDetail = firstCandidate
      ? selectedHotelStay(firstCandidate)
      : undefined
    running.hotelStayState =
      firstCandidate && stayDetail
        ? {
            kind: "available",
            selection: { candidate: firstCandidate, stayDetail },
          }
        : { kind: "empty" }
    await appendWorkspaceMessage(running.context, running.workspaceId, {
      role: "ASSISTANT",
      content: "",
      blocks: [
        {
          type: "hotel_search",
          title: `${input.place}酒店推荐`,
          fetchedAt: new Date().toISOString(),
          candidates: result.candidates.map((candidate) => ({
            candidateId: candidate.candidateId,
            provider: candidate.provider,
            providerHotelId: candidate.providerHotelId,
            name: candidate.name,
            address: candidate.address,
            startingPrice: candidate.startingPrice,
            imageUrl: candidate.imageUrl,
            externalUrl: candidate.externalUrl,
          })),
        },
      ],
      agentRunId: running.runId,
    })
    return {
      count: result.candidates.length,
      warnings: result.warnings,
      firstCandidate,
      stayDetail,
    }
  }

  private async withProviderSpan<T>(
    running: RunningAgent,
    parentSpan: TelemetrySpan,
    provider: string,
    operation: string,
    callback: () => Promise<T>
  ) {
    const span = running.telemetry.startSpan(
      "provider.request",
      OpenInferenceSpanKind.CHAIN,
      {
        "periplus.provider": provider,
        "periplus.provider.operation": operation,
      },
      parentSpan.context
    )
    try {
      const result = await running.telemetry.withSpan(span, callback)
      span.setAttribute("output.value", redactedInput(result) ?? "")
      span.end("OK")
      return result
    } catch (error) {
      span.end("ERROR", {
        "error.type": error instanceof Error ? error.name : "Error",
      })
      throw error
    }
  }

  private toolServers(
    running: RunningAgent,
    mode: AgentMode
  ): AgentToolServer[] {
    if (mode !== "auto") return []
    return [
      {
        id: "periplus-workspace",
        command: join(this.options.projectRoot, "node_modules/.bin/tsx"),
        args: ["backend/mcp/server.ts"],
        cwd: this.options.projectRoot,
        configFile: {
          fileName: "workspace-mcp-config.json",
          argument: "--config",
          content: JSON.stringify(
            {
              backendUrl: this.options.backendUrl,
              capabilityToken: running.capabilityToken,
              traceCarrier: running.telemetry.traceCarrier,
            },
            null,
            2
          ),
        },
      },
    ]
  }

  private persistStdout(
    running: RunningAgent,
    text: string,
    emit: AgentEventEmitter
  ) {
    running.outputWrite = running.outputWrite
      .then(async () => {
        const persistStartedAt = performance.now()
        await appendWorkspaceMessageDelta(
          running.context,
          running.workspaceId,
          running.assistantMessageId,
          running.runId,
          text,
          this.now()
        )
        running.telemetry.recordStreamPersistence(
          text,
          performance.now() - persistStartedAt,
          this.now()
        )
        running.stdout += text
        await this.heartbeat(running)
        emit(running.workspaceId, {
          type: "agent.message.delta",
          payload: {
            runId: running.runId,
            messageId: running.assistantMessageId,
            stream: "stdout",
            text,
          },
        })
      })
      .catch((error) => {
        running.runtimeFailed = true
        running.cancelled = true
        running.runtimeRun?.cancel()
        emit(running.workspaceId, {
          type: "agent.run.failed",
          payload: {
            runId: running.runId,
            message:
              error instanceof Error ? error.message : "Agent output failed",
          },
        })
      })
  }

  private startHeartbeat(running: RunningAgent) {
    if (this.heartbeatIntervalMs === null) return
    running.heartbeatTimer = setInterval(() => {
      void this.heartbeat(running).catch(() => {
        running.runtimeFailed = true
        running.cancelled = true
        running.runtimeRun?.cancel()
      })
    }, this.heartbeatIntervalMs)
    running.heartbeatTimer.unref?.()
  }

  private heartbeat(running: RunningAgent) {
    return heartbeatWorkspaceAgentRun(
      running.context,
      running.workspaceId,
      running.runId,
      this.runtimeOwnerId,
      this.now(),
      this.agentRunLeaseSeconds
    )
  }

  private heartbeatInBackground(running: RunningAgent) {
    void this.heartbeat(running).catch(() => {
      if (running.finished) return
      running.runtimeFailed = true
      running.cancelled = true
      running.runtimeRun?.cancel()
    })
  }

  private releaseRuntime(running: RunningAgent) {
    if (running.heartbeatTimer) clearInterval(running.heartbeatTimer)
    running.heartbeatTimer = null
    this.runs.delete(running.workspaceId)
    this.runsByCapability.delete(running.capabilityToken)
  }

  private async finish(
    running: RunningAgent,
    mode: AgentMode,
    result: AgentRuntimeExit,
    emit: AgentEventEmitter
  ) {
    if (running.finished) return
    running.finished = true
    if (running.heartbeatTimer) clearInterval(running.heartbeatTimer)
    running.heartbeatTimer = null

    let failed =
      running.runtimeFailed || (!running.cancelled && result.code !== 0)
    let validationErrorCode: string | undefined
    try {
      await running.outputWrite
      failed ||= running.runtimeFailed
      if (mode === "suggest" && result.code === 0 && !running.cancelled) {
        const suggestion = parseSuggestion(running.stdout)
        await createWorkspaceSuggestion(running.context, running.workspaceId, {
          title: suggestion.title,
          summary: suggestion.summary,
          commandPayloads: suggestion.commandPayloads,
          basedOnWorkspaceRevision: suggestion.basedOnWorkspaceRevision,
        })
      }
      if (
        mode === "auto" &&
        !failed &&
        !running.cancelled &&
        running.requiresPlanValidation
      ) {
        const document = await this.commands.getDocument(
          running.context,
          running.workspaceId
        )
        if (!document) throw new WorkspaceInputError("Workspace was not found")
        const validationSpan = running.telemetry.startSpan(
          "workspace.validate_plan.final",
          OpenInferenceSpanKind.CHAIN
        )
        const finalValidation = validateJourneyPlan({
          graph: document.session.headGraph,
          workspaceRevision: document.session.headWorkspaceRevision,
        })
        const lastValidation = running.lastPlanValidation
        const passed =
          lastValidation?.valid === true &&
          finalValidation.valid &&
          lastValidation.workspaceRevision ===
            finalValidation.workspaceRevision &&
          lastValidation.projectionHash === finalValidation.projectionHash
        validationSpan.end("OK", {
          "periplus.validation.valid": finalValidation.valid,
          "periplus.validation.passed": passed,
          "periplus.workspace.revision": finalValidation.workspaceRevision,
        })
        await this.trace(running, {
          type: "validator.completed",
          spanId: randomUUID(),
          parentSpanId: running.traceRunSpanId,
          status: "OK",
          payload: {
            valid: passed,
            issueCodes: finalValidation.issues.map((issue) => issue.code),
            projectionHash: finalValidation.projectionHash,
            workspaceRevision: finalValidation.workspaceRevision,
            finalGate: true,
          },
        })
        if (!passed) {
          failed = true
          validationErrorCode = lastValidation
            ? "PLAN_VALIDATION_FAILED"
            : "PLAN_VALIDATION_REQUIRED"
          emit(running.workspaceId, {
            type: "agent.run.failed",
            payload: {
              runId: running.runId,
              code: validationErrorCode,
              validation: finalValidation,
            },
          })
        }
      }
    } catch (error) {
      failed = true
      emit(running.workspaceId, {
        type: "agent.run.failed",
        payload: {
          runId: running.runId,
          message:
            error instanceof Error ? error.message : "Agent output failed",
        },
      })
    }

    try {
      await this.withTelemetrySpan(
        running.telemetry,
        "agent.run.finish.persist",
        () =>
          finishWorkspaceAgentRun(
            running.context,
            running.workspaceId,
            running.runId,
            {
              status: failed
                ? "FAILED"
                : running.cancelled
                  ? "CANCELLED"
                  : "SUCCEEDED",
              errorCode: failed
                ? (validationErrorCode ?? "AGENT_RUNTIME_FAILED")
                : undefined,
              errorMessage: validationErrorCode,
              runtimeOwnerId: this.runtimeOwnerId,
              now: this.now(),
            }
          )
      )
      await this.trace(running, {
        type: failed || running.cancelled ? "run.failed" : "run.completed",
        spanId: running.traceRunSpanId,
        status: failed || running.cancelled ? "ERROR" : "OK",
        payload: {
          cancelled: running.cancelled,
          exitCode: result.code,
          runtimeId: result.metadata.runtimeId,
        },
      })
    } catch (error) {
      failed = true
      emit(running.workspaceId, {
        type: "agent.run.failed",
        payload: {
          runId: running.runId,
          message:
            error instanceof Error ? error.message : "Agent finish failed",
        },
      })
    } finally {
      if (result.code !== 0 && !running.cancelled && !running.runtimeFailed) {
        running.telemetry.recordRuntimeError("exit_code")
      }
      running.telemetry.finishRuntimeStream(
        failed ? "ERROR" : running.cancelled ? "CANCELLED" : "OK"
      )
    }
    try {
      const document = await this.withTelemetrySpan(
        running.telemetry,
        "agent.workspace.unlock.load",
        () => this.commands.getDocument(running.context, running.workspaceId)
      )
      emit(running.workspaceId, {
        type: "workspace.unlocked",
        payload: document,
      })
    } catch (error) {
      failed = true
      running.telemetry.root.recordException(error)
      emit(running.workspaceId, {
        type: "agent.run.failed",
        payload: {
          runId: running.runId,
          message:
            error instanceof Error ? error.message : "Workspace unlock failed",
        },
      })
    } finally {
      running.telemetry.finish(
        failed ? "ERROR" : running.cancelled ? "CANCELLED" : "OK",
        running.stdout,
        {
          "periplus.agent.exit_code": result.code ?? -1,
          "periplus.agent.runtime": result.metadata.runtimeId,
        }
      )
      this.releaseRuntime(running)
    }
    emit(running.workspaceId, {
      type: failed
        ? "agent.run.failed"
        : running.cancelled
          ? "agent.run.cancelled"
          : "agent.run.completed",
      payload: {
        runId: running.runId,
        code: result.code,
        ...result.metadata,
        ...(running.telemetry.traceId
          ? { traceId: running.telemetry.traceId }
          : {}),
      },
    })
  }

  private async failToStart(
    running: RunningAgent,
    error: unknown,
    emit: AgentEventEmitter
  ) {
    if (running.finished) return
    running.finished = true
    if (running.heartbeatTimer) clearInterval(running.heartbeatTimer)
    running.heartbeatTimer = null
    running.telemetry.recordRuntimeError(
      error instanceof Error ? error.name : "Error"
    )
    try {
      await this.withTelemetrySpan(
        running.telemetry,
        "agent.run.finish.persist",
        () =>
          finishWorkspaceAgentRun(
            running.context,
            running.workspaceId,
            running.runId,
            {
              status: "FAILED",
              errorCode: "AGENT_START_FAILED",
              errorMessage:
                error instanceof Error ? error.message : "Agent runtime failed",
              runtimeOwnerId: this.runtimeOwnerId,
              now: this.now(),
            }
          )
      )
      await this.trace(running, {
        type: "run.failed",
        spanId: running.traceRunSpanId,
        status: "ERROR",
        payload: {
          errorName: error instanceof Error ? error.name : "Error",
          errorMessage:
            error instanceof Error ? error.message : "Agent runtime failed",
        },
      })
    } catch (finishError) {
      running.telemetry.root.recordException(finishError)
    } finally {
      running.telemetry.finishRuntimeStream("ERROR", error)
      let document = null
      try {
        document = await this.withTelemetrySpan(
          running.telemetry,
          "agent.workspace.unlock.load",
          () => this.commands.getDocument(running.context, running.workspaceId)
        )
      } catch (unlockError) {
        running.telemetry.root.recordException(unlockError)
      }
      emit(running.workspaceId, {
        type: "workspace.unlocked",
        payload: document,
      })
      running.telemetry.finish("ERROR", running.stdout, {
        "periplus.agent.error_type":
          error instanceof Error ? error.name : "Error",
      })
      this.releaseRuntime(running)
    }
    emit(running.workspaceId, {
      type: "agent.run.failed",
      payload: {
        runId: running.runId,
        runtimeId: this.runtime.id,
        ...(running.telemetry.traceId
          ? { traceId: running.telemetry.traceId }
          : {}),
        message:
          error instanceof Error ? error.message : "Agent runtime failed",
      },
    })
  }
}
