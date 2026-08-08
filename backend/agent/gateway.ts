import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { z } from "zod"
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
import { buildPrompt } from "./prompt"
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
  requiresPlanValidation: boolean
  lastPlanValidation: PlanValidationReport | null
  hotelStayState: HotelStayState
  verifiedPlaces: Map<string, PlaceVerification>
  drafts: Map<string, PreparedAgentDraft>
  draftRequests: Map<string, string>
  draftHotelSelections: Map<string, HotelStaySelection>
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

  async start(
    context: AuthContext,
    workspaceId: string,
    prompt: string,
    mode: AgentMode,
    emit: AgentEventEmitter
  ) {
    let initial = await this.commands.getDocument(context, workspaceId)
    if (!initial) throw new WorkspaceInputError("Workspace was not found")
    if (this.runs.has(workspaceId)) {
      emit(workspaceId, {
        type: "error",
        payload: { message: "当前 Workspace 正在由 Agent 修改" },
      })
      return
    }
    if (initial.agentRuns.some((run) => run.status === "RUNNING")) {
      await reconcileExpiredWorkspaceAgentRun(
        context,
        workspaceId,
        this.runtimeOwnerId,
        this.now()
      )
      initial = await this.commands.getDocument(context, workspaceId)
      if (!initial) throw new WorkspaceInputError("Workspace was not found")
      if (initial.agentRuns.some((run) => run.status === "RUNNING")) {
        emit(workspaceId, {
          type: "error",
          payload: { message: "当前 Workspace 正在由 Agent 修改" },
        })
        return
      }
    }

    const persistedRun = await startWorkspaceAgentRun(
      context,
      workspaceId,
      this.now(),
      this.runtimeOwnerId,
      this.agentRunLeaseSeconds
    )
    if (!persistedRun) throw new WorkspaceInputError("Workspace was not found")
    let assistantMessageId: string
    try {
      await appendWorkspaceMessage(context, workspaceId, {
        role: "USER",
        content: prompt,
      })
      const assistantMessage = await appendWorkspaceMessage(
        context,
        workspaceId,
        {
          role: "ASSISTANT",
          content: "",
          agentRunId: persistedRun.id,
        }
      )
      if (!assistantMessage) {
        throw new WorkspaceInputError("Assistant message could not be created")
      }
      assistantMessageId = assistantMessage.id
    } catch (error) {
      try {
        await finishWorkspaceAgentRun(context, workspaceId, persistedRun.id, {
          status: "FAILED",
          errorCode: "AGENT_MESSAGE_FAILED",
          errorMessage:
            error instanceof Error ? error.message : "User message failed",
          runtimeOwnerId: this.runtimeOwnerId,
          now: this.now(),
        })
      } catch {
        // Preserve the original persistence failure if terminalization fails.
      }
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
      requiresPlanValidation: false,
      lastPlanValidation: null,
      hotelStayState: { kind: "not_searched" },
      verifiedPlaces: new Map(),
      drafts: new Map(),
      draftRequests: new Map(),
      draftHotelSelections: new Map(),
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
      const document = await this.commands.getDocument(context, workspaceId)
      if (!document) throw new WorkspaceInputError("Workspace was not found")
      emit(workspaceId, { type: "workspace.locked", payload: document })
      emit(workspaceId, {
        type: "agent.run.started",
        payload: { runId: running.runId, runtimeId: this.runtime.id },
      })
      const runtimeRun = await this.runtime.start(
        {
          runId: running.runId,
          prompt: draftPrompt(conversationMessages(document), mode, document),
          toolServers: this.toolServers(running, mode),
        },
        {
          onStdout: (text) => {
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
            emit(workspaceId, {
              type: "agent.run.failed",
              payload: { runId: running.runId, message: error.message },
            })
          },
          onExit: (result) => {
            void this.finish(running, mode, result, emit)
          },
        }
      )
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
        const validation = validateJourneyPlan({
          graph: document.session.headGraph,
          workspaceRevision: document.session.headWorkspaceRevision,
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
          if (!request.previousDraftId) {
            throw new WorkspaceInputError(
              "Repair draft must reference the previous invalid draft"
            )
          }
          baseDraft = running.drafts.get(request.previousDraftId)
          if (!baseDraft || baseDraft.validation.valid) {
            throw new WorkspaceInputError(
              "Repair draft must reference a previous invalid draft"
            )
          }
          const allowed = new Set(
            baseDraft.validation.issues
              .filter((issue) => issue.severity === "ERROR")
              .flatMap((issue) => issue.allowedOperations)
          )
          for (const command of request.commands) {
            const parsed = targetCommandBodySchema.parse(command)
            if (!allowed.has(parsed.name)) {
              throw new WorkspaceInputError(
                `Repair command ${parsed.name} is not allowed by the previous draft issues`
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
            const prepared = await this.commands.prepareAgentDraft(
              running.context,
              {
                workspaceId: running.workspaceId,
                expectedRevision: request.expectedRevision,
                idempotencyKey: request.idempotencyKey,
                actor: { kind: "AGENT", agentRunId: running.runId },
                commands: hotel.commands,
                baseDraft,
                verifiedPlaces: Array.from(running.verifiedPlaces.values()),
              }
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
        }
        const repairsUsed = Math.max(0, running.draftValidationAttempts - 1)
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
        const result = await this.commands.commitAgentDraft(
          running.context,
          draft
        )
        if (hotelSelection && running.hotelStayState.kind === "available") {
          running.hotelStayState = {
            kind: "consumed",
            selection: hotelSelection,
            idempotencyKey: request.draftId,
          }
        }
        running.requiresPlanValidation = true
        running.lastPlanValidation = draft.validation
        const document = await this.commands.getDocument(
          running.context,
          running.workspaceId
        )
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
            const previous = running.drafts.get(request.previousDraftId)
            if (!previous || previous.validation.valid) {
              throw new WorkspaceInputError(
                "Transit preparation must reference a previous invalid draft"
              )
            }
            const allowed = previous.validation.issues
              .filter((issue) => issue.severity === "ERROR")
              .some((issue) =>
                issue.allowedOperations.includes("journey.plan_transit")
              )
            if (!allowed) {
              throw new WorkspaceInputError(
                "Transit preparation is not allowed by the previous draft issues"
              )
            }
            const prepared = await this.commands.prepareAgentTransit(
              running.context,
              {
                draft: previous,
                idempotencyKey: request.idempotencyKey,
                eventId: request.eventId,
                verifiedPlaces: Array.from(running.verifiedPlaces.values()),
              }
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
        }
        const repairsUsed = Math.max(0, running.draftValidationAttempts - 1)
        output = {
          draftId: request.idempotencyKey,
          validation: draft.validation,
          repairsRemaining: Math.max(0, 2 - repairsUsed),
        }
      } else if (isPlaceToolRequest(request)) {
        output = await this.executePlaceTool(running, request)
      } else if (request.type === "hotel.search") {
        output = await this.executeHotelTool(running, request)
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
      return output
    } catch (error) {
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
      throw error
    }
  }

  private async executePlaceTool(
    running: RunningAgent,
    request: PlaceAgentToolRequest
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
      const result = await this.placeService.searchPlaces(input, usageContext)
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
      const result = await this.placeService.resolvePlace(input, usageContext)
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
      return this.placeService.enrichPlace(input, usageContext)
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
    const result = await this.placeService.resolvePlaceForJourneyEvent(
      input,
      event.type,
      usageContext
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
    request: HotelAgentToolRequest
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
    const result = await this.hotelService.searchHotels(input, usageContext)
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
        await appendWorkspaceMessageDelta(
          running.context,
          running.workspaceId,
          running.assistantMessageId,
          running.runId,
          text,
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
        const finalValidation = validateJourneyPlan({
          graph: document.session.headGraph,
          workspaceRevision: document.session.headWorkspaceRevision,
        })
        const lastValidation = running.lastPlanValidation
        const passed =
          lastValidation?.valid === true &&
          finalValidation.valid &&
          lastValidation.workspaceRevision === finalValidation.workspaceRevision
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
      await finishWorkspaceAgentRun(
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
      this.releaseRuntime(running)
    }
    const document = await this.commands.getDocument(
      running.context,
      running.workspaceId
    )
    emit(running.workspaceId, { type: "workspace.unlocked", payload: document })
    emit(running.workspaceId, {
      type: failed
        ? "agent.run.failed"
        : running.cancelled
          ? "agent.run.cancelled"
          : "agent.run.completed",
      payload: { runId: running.runId, code: result.code, ...result.metadata },
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
    try {
      await finishWorkspaceAgentRun(
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
    } finally {
      this.releaseRuntime(running)
    }
    emit(running.workspaceId, {
      type: "agent.run.failed",
      payload: {
        runId: running.runId,
        runtimeId: this.runtime.id,
        message:
          error instanceof Error ? error.message : "Agent runtime failed",
      },
    })
  }
}
