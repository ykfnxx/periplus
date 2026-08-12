import { randomUUID } from "node:crypto"
import { z } from "zod"
import type { AuthContext } from "@/modules/auth/server/context"
import { hotelSearchInputSchema } from "@/backend/mcp/schemas/hotel"
import {
  draftAddCityCardInputSchema,
  draftAddHotelStayCardInputSchema,
  draftAddPlaceCardInputSchema,
  draftAddPlaceStayCardInputSchema,
  draftAddTransitCardInputSchema,
  draftChangePlaceInputSchema,
  draftCommitInputSchema,
  draftConnectCardsInputSchema,
  draftDisconnectCardsInputSchema,
  draftGetInputSchema,
  draftMoveCardInputSchema,
  draftOpenInputSchema,
  draftPrepareTransitInputSchema,
  draftRemoveCardInputSchema,
  draftUpdateCityCardInputSchema,
  draftUpdateScheduleInputSchema,
  draftUpdateTransitCardInputSchema,
  draftValidateInputSchema,
} from "@/backend/mcp/schemas/draft"
import {
  journeyCurrentValidationInputSchema,
  journeyProjectionInputSchema,
  workspaceContextInputSchema,
} from "@/backend/mcp/schemas/workspace"
import {
  isAttractionCategory,
  isAttractionSearch,
} from "@/lib/places/attractions"
import {
  placeEnrichInputSchema,
  placeFallbackInputSchema,
  placeResolveInputSchema,
  placeSearchInputSchema,
} from "@/backend/mcp/schemas/place"
import {
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
  getWorkspaceAgentContextCheckpoint,
  heartbeatWorkspaceAgentRun,
  reconcileExpiredWorkspaceAgentRun,
  saveWorkspaceAgentContextCheckpoint,
  startWorkspaceAgentRun,
  WorkspaceInputError,
  WorkspaceRevisionConflictError,
} from "@/modules/data/workspaces/workspace-repository"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"
import type { AgentEventEmitter, AgentMode } from "../types"
import { buildPrompt, promptVersion } from "./prompt"
import type {
  PeriplusAgentHarness,
  PeriplusAgentHarnessResult,
  PeriplusAgentHarnessRun,
  PeriplusHarnessEvent,
  PersistedAgentMessage,
} from "./periplus-agent-harness"
import { parseSuggestion } from "./suggestion"
import { type EvalTraceInput, type EvalTraceSink } from "./evals"
import {
  AgentRunTelemetry,
  redactedInput,
  startAgentRunTelemetry,
  type TelemetrySpan,
} from "../observability"
import {
  OpenInferenceSpanKind,
  TOOL_NAME,
} from "@arizeai/openinference-semantic-conventions"
import { AgentDraftSession, type DraftMutationRequest } from "./draft-session"

interface AgentGatewayOptions {
  runtimeOwnerId?: string
  agentRunLeaseSeconds?: number
  heartbeatIntervalMs?: number | null
  now?: () => Date
  placeService?: Pick<
    PlaceIntelligenceService,
    "searchPlaces" | "resolvePlace" | "enrichPlace" | "verifyPlaceImages"
  >
  hotelService?: Pick<HotelSearchService, "searchHotels">
  evalTrace?: {
    scenarioId: string
    sink: EvalTraceSink
  }
}

interface RunningAgent {
  workspaceId: string
  context: AuthContext
  runId: string
  harnessRun: PeriplusAgentHarnessRun | null
  cancelled: boolean
  finished: boolean
  runtimeFailed: boolean
  assistantOutput: string
  assistantOutputBuffer: string
  assistantOutputFlushTimer: ReturnType<typeof setTimeout> | null
  currentAssistantMessageText: string
  assistantMessageId: string
  outputWrite: Promise<void>
  failureCode: string | null
  failureMessage: string | null
  toolAbortController: AbortController
  inFlightTools: Set<Promise<void>>
  heartbeatTimer: ReturnType<typeof setInterval> | null
  traceRunSpanId: string
  traceFailure: Error | null
  telemetry: AgentRunTelemetry
  modelSpans: Map<string, TelemetrySpan>
  requiresPlanValidation: boolean
  lastPlanValidation: PlanValidationReport | null
  draftSession: AgentDraftSession
}

export const agentToolRequestSchema = z.union([
  workspaceContextInputSchema.safeExtend({
    type: z.literal("workspace.get_context"),
  }),
  journeyProjectionInputSchema.safeExtend({
    type: z.literal("journey.project"),
  }),
  journeyCurrentValidationInputSchema.safeExtend({
    type: z.literal("journey.validate_current"),
  }),
  draftOpenInputSchema.safeExtend({ type: z.literal("draft.open") }),
  draftGetInputSchema.safeExtend({ type: z.literal("draft.get") }),
  draftAddCityCardInputSchema.safeExtend({
    type: z.literal("draft.add_city_card"),
  }),
  draftAddPlaceCardInputSchema.safeExtend({
    type: z.literal("draft.add_place_card"),
  }),
  draftAddHotelStayCardInputSchema.safeExtend({
    type: z.literal("draft.add_hotel_stay_card"),
  }),
  draftAddPlaceStayCardInputSchema.safeExtend({
    type: z.literal("draft.add_place_stay_card"),
  }),
  draftAddTransitCardInputSchema.safeExtend({
    type: z.literal("draft.add_transit_card"),
  }),
  draftUpdateCityCardInputSchema.safeExtend({
    type: z.literal("draft.update_city_card"),
  }),
  draftUpdateScheduleInputSchema.safeExtend({
    type: z.literal("draft.update_schedule"),
  }),
  draftChangePlaceInputSchema.safeExtend({
    type: z.literal("draft.change_place"),
  }),
  draftUpdateTransitCardInputSchema.safeExtend({
    type: z.literal("draft.update_transit_card"),
  }),
  draftMoveCardInputSchema.safeExtend({
    type: z.literal("draft.move_card"),
  }),
  draftRemoveCardInputSchema.safeExtend({
    type: z.literal("draft.remove_card"),
  }),
  draftConnectCardsInputSchema.safeExtend({
    type: z.literal("draft.connect_cards"),
  }),
  draftDisconnectCardsInputSchema.safeExtend({
    type: z.literal("draft.disconnect_cards"),
  }),
  draftValidateInputSchema.safeExtend({
    type: z.literal("draft.validate"),
  }),
  draftPrepareTransitInputSchema.safeExtend({
    type: z.literal("draft.prepare_transit"),
  }),
  draftCommitInputSchema.safeExtend({ type: z.literal("draft.commit") }),
  placeSearchInputSchema.safeExtend({ type: z.literal("place.search") }),
  placeResolveInputSchema.safeExtend({ type: z.literal("place.resolve") }),
  placeFallbackInputSchema.safeExtend({ type: z.literal("place.fallback") }),
  placeEnrichInputSchema.safeExtend({ type: z.literal("place.enrich") }),
  hotelSearchInputSchema.safeExtend({ type: z.literal("hotel.search") }),
])

export type AgentToolRequest = z.input<typeof agentToolRequestSchema>
type ParsedAgentToolRequest = z.output<typeof agentToolRequestSchema>

type PlaceAgentToolRequest = Extract<
  ParsedAgentToolRequest,
  { type: `place.${string}` }
>
type HotelAgentToolRequest = Extract<
  ParsedAgentToolRequest,
  { type: "hotel.search" }
>

function isPlaceToolRequest(
  request: ParsedAgentToolRequest
): request is PlaceAgentToolRequest {
  return request.type.startsWith("place.")
}

function isEvidenceToolRequest(request: ParsedAgentToolRequest) {
  return isPlaceToolRequest(request) || request.type === "hotel.search"
}

const DRAFT_MUTATION_TYPES = new Set<DraftMutationRequest["type"]>([
  "draft.add_city_card",
  "draft.add_place_card",
  "draft.add_hotel_stay_card",
  "draft.add_place_stay_card",
  "draft.add_transit_card",
  "draft.update_city_card",
  "draft.update_schedule",
  "draft.change_place",
  "draft.update_transit_card",
  "draft.move_card",
  "draft.remove_card",
  "draft.connect_cards",
  "draft.disconnect_cards",
])

function isDraftMutationRequest(
  request: ParsedAgentToolRequest
): request is DraftMutationRequest {
  return DRAFT_MUTATION_TYPES.has(request.type as DraftMutationRequest["type"])
}

function withoutRequestId<T extends { requestId: string }>(
  input: T
): Omit<T, "requestId"> {
  const output: Partial<T> = { ...input }
  delete output.requestId
  return output as Omit<T, "requestId">
}

function withoutToolType<T extends { type: string }>(
  input: T
): Omit<T, "type"> {
  const output: Partial<T> = { ...input }
  delete output.type
  return output as Omit<T, "type">
}

function conversationMessages(
  document: NonNullable<
    Awaited<ReturnType<WorkspaceCommandService["getDocument"]>>
  >
): PersistedAgentMessage[] {
  return document.messages
    .filter((message) => message.role !== "SYSTEM" && message.content.trim())
    .map((message) => ({
      id: message.id,
      role: message.role === "USER" ? "user" : "assistant",
      content: message.content,
      createdAt: message.createdAt,
    }))
}

function draftPrompt(mode: AgentMode, snapshot: unknown) {
  return buildPrompt(mode, JSON.stringify(snapshot, null, 2))
}

const OUTPUT_FLUSH_DELAY_MS = 50
const OUTPUT_FLUSH_BYTES = 512

export class AgentGateway {
  private readonly runs = new Map<string, RunningAgent>()
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
    private readonly harness: PeriplusAgentHarness,
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
      runtimeId: this.harness.id,
      promptVersion: promptVersion(mode),
    })

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
    const running: RunningAgent = {
      workspaceId,
      context,
      runId: persistedRun.id,
      harnessRun: null,
      cancelled: false,
      finished: false,
      runtimeFailed: false,
      assistantOutput: "",
      assistantOutputBuffer: "",
      assistantOutputFlushTimer: null,
      currentAssistantMessageText: "",
      assistantMessageId,
      outputWrite: Promise.resolve(),
      failureCode: null,
      failureMessage: null,
      toolAbortController: new AbortController(),
      inFlightTools: new Set(),
      heartbeatTimer: null,
      traceRunSpanId: randomUUID(),
      traceFailure: null,
      telemetry,
      modelSpans: new Map(),
      requiresPlanValidation: false,
      lastPlanValidation: null,
      draftSession: new AgentDraftSession(
        workspaceId,
        persistedRun.id,
        context,
        this.commands
      ),
    }
    this.runs.set(workspaceId, running)
    this.startHeartbeat(running)

    try {
      await this.trace(running, {
        type: "run.started",
        spanId: running.traceRunSpanId,
        status: "OK",
        payload: { mode, runtimeId: this.harness.id },
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
          runtimeId: this.harness.id,
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
      const runtimePrompt = draftPrompt(mode, document)
      promptSpan.end("OK", {
        "periplus.prompt.length": runtimePrompt.length,
      })

      const runtimeStartSpan = running.telemetry.startSpan(
        "agent.runtime.start",
        OpenInferenceSpanKind.CHAIN,
        {
          "periplus.agent.runtime": this.harness.id,
          "periplus.agent.mode": mode,
        }
      )
      try {
        const checkpoint = await getWorkspaceAgentContextCheckpoint(
          context,
          workspaceId
        )
        running.telemetry.startRuntimeStream(runtimeStartSpan.context)
        const harnessRun = await running.telemetry.withSpan(
          runtimeStartSpan,
          () =>
            this.harness.start(
              {
                runId: running.runId,
                workspaceId,
                mode,
                systemPrompt: runtimePrompt,
                messages: conversationMessages(document),
                checkpoint,
                executeTool: (request, signal) =>
                  this.executeTool(running, request, signal),
                saveCheckpoint: async (nextCheckpoint) => {
                  await saveWorkspaceAgentContextCheckpoint(
                    context,
                    workspaceId,
                    nextCheckpoint,
                    this.now()
                  )
                },
              },
              {
                onEvent: (event) =>
                  this.handleHarnessEvent(running, mode, event, emit),
              }
            )
        )
        runtimeStartSpan.end("OK")
        running.harnessRun = harnessRun
      } catch (error) {
        runtimeStartSpan.end("ERROR", {
          "error.type": error instanceof Error ? error.name : "Error",
        })
        throw error
      }
      if (running.cancelled) running.harnessRun?.cancel()
    } catch (error) {
      await this.failToStart(running, error, emit)
    }
  }

  private handleHarnessEvent(
    running: RunningAgent,
    mode: AgentMode,
    event: PeriplusHarnessEvent,
    emit: AgentEventEmitter
  ) {
    if (event.type === "context_prepared") {
      running.telemetry.setPromptInput(event.input)
      running.telemetry.root.setAttributes({
        "periplus.context.message_count": event.messageCount,
        "periplus.context.estimated_tokens": event.estimatedTokens,
        "periplus.context.compacted": event.compacted,
      })
      return
    }
    if (event.type === "model_start") {
      const span = running.telemetry.startSpan(
        "llm.request",
        OpenInferenceSpanKind.LLM,
        {
          "llm.provider": event.provider,
          "llm.model_name": event.model,
          "periplus.prompt.version": promptVersion(mode),
        }
      )
      span.setAttribute("input.value", redactedInput(event.input) ?? "")
      running.modelSpans.set(event.requestId, span)
      return
    }
    if (event.type === "model_end") {
      const span = running.modelSpans.get(event.requestId)
      if (!span) return
      running.modelSpans.delete(event.requestId)
      span.setAttribute("output.value", redactedInput(event.output) ?? "")
      span.end(event.stopReason === "error" ? "ERROR" : "OK", {
        "llm.token_count.prompt": event.usage.input,
        "llm.token_count.completion": event.usage.output,
        "llm.token_count.total": event.usage.totalTokens,
        "llm.token_count.cache_read": event.usage.cacheRead,
        "llm.token_count.cache_write": event.usage.cacheWrite,
        "periplus.llm.duration_ms": event.endedAt - span.startedAt,
        "periplus.llm.stop_reason": event.stopReason,
      })
      return
    }
    if (event.type === "message_delta") {
      running.currentAssistantMessageText += event.text
      running.telemetry.recordStreamDelta(event.text)
      this.persistAssistantOutput(running, event.text, emit)
      return
    }
    if (event.type === "message_end") {
      const remaining = event.text.slice(
        running.currentAssistantMessageText.length
      )
      if (remaining) this.persistAssistantOutput(running, remaining, emit)
      running.currentAssistantMessageText = ""
      return
    }
    if (event.type === "tool_start") {
      running.telemetry.root.addEvent("agent.tool.start", {
        "periplus.tool.call_id": event.toolCallId,
        "periplus.tool.name": event.toolName,
      })
      return
    }
    if (event.type === "tool_end") {
      running.telemetry.root.addEvent("agent.tool.end", {
        "periplus.tool.call_id": event.toolCallId,
        "periplus.tool.name": event.toolName,
        "periplus.tool.error": event.isError,
      })
      return
    }
    if (event.type === "run_end") {
      void this.finish(running, mode, event.result, emit)
    }
  }

  cancel(workspaceId: string) {
    const running = this.runs.get(workspaceId)
    if (!running || running.finished) return
    running.cancelled = true
    running.toolAbortController.abort()
    running.harnessRun?.cancel()
  }

  private async executeTool(
    running: RunningAgent,
    rawRequest: AgentToolRequest,
    signal?: AbortSignal
  ): Promise<unknown> {
    const request = agentToolRequestSchema.parse(rawRequest)
    if (running.finished || signal?.aborted) {
      throw new WorkspaceInputError("Agent tool execution is no longer active")
    }
    const toolSpanId = randomUUID()
    const startedAt = performance.now()
    const otelToolSpan = running.telemetry.startSpan(
      "agent.tool",
      OpenInferenceSpanKind.TOOL,
      {
        [TOOL_NAME]: request.type,
      },
      running.telemetry.context
    )
    otelToolSpan.setAttribute("input.value", redactedInput(request) ?? "")
    const otelDraftSpan =
      request.type.startsWith("draft.") ||
      request.type === "journey.validate_current"
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
    let markToolComplete!: () => void
    const toolCompletion = new Promise<void>((resolve) => {
      markToolComplete = resolve
    })
    running.inFlightTools.add(toolCompletion)
    try {
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
        },
      })
      await this.heartbeat(running)
      running.draftSession.assertToolAllowed(request.type)
      let output: unknown
      if (request.type === "workspace.get_context") {
        const document = await this.commands.getDocument(
          running.context,
          running.workspaceId
        )
        if (!document) throw new WorkspaceInputError("Workspace was not found")
        const cityCards = document.session.headGraph.events.flatMap((event) =>
          event.type === "SECTION" &&
          event.detail.kind === "CITY" &&
          event.parentSectionEventId === null &&
          event.placementStatus === "SCHEDULED" &&
          (event.retiredRevision == null ||
            event.retiredRevision > document.session.headGraph.revision)
            ? [
                {
                  cardId: event.id,
                  title: event.title,
                  timeZone: event.detail.timeZone,
                },
              ]
            : []
        )
        output = {
          workspaceId: document.session.id,
          workspaceStatus: document.session.status,
          headWorkspaceRevision: document.session.headWorkspaceRevision,
          journeyId: document.session.headGraph.id,
          hasJourney: cityCards.length > 0,
          cityCards,
        }
      } else if (request.type === "journey.project") {
        const document = await this.commands.getDocument(
          running.context,
          running.workspaceId
        )
        if (!document) throw new WorkspaceInputError("Workspace was not found")
        const projection = resolveJourneyProjection({
          graph: document.session.headGraph,
          scopeSectionEventId: request.scopeCityCardId,
          mode: "PLANNER",
        })
        const eventById = new Map(
          document.session.headGraph.events.map((event) => [event.id, event])
        )
        output = {
          workspaceRevision: document.session.headWorkspaceRevision,
          scopeCityCardId: request.scopeCityCardId,
          cards: projection.events.map((resolved) => {
            const event = eventById.get(resolved.eventId)!
            return {
              cardId: event.id,
              type: event.type === "SECTION" ? "CITY" : event.type,
              title: event.title,
              ...("plannedStartAt" in event && event.plannedStartAt
                ? { plannedStartAt: event.plannedStartAt }
                : {}),
              ...("plannedEndAt" in event && event.plannedEndAt
                ? { plannedEndAt: event.plannedEndAt }
                : {}),
              ...(event.type === "TRANSIT"
                ? {
                    fromCardId: event.detail.plannedFromEventId,
                    toCardId: event.detail.plannedToEventId,
                  }
                : {}),
            }
          }),
        }
      } else if (request.type === "journey.validate_current") {
        const document = await this.commands.getDocument(
          running.context,
          running.workspaceId
        )
        if (!document) throw new WorkspaceInputError("Workspace was not found")
        if (
          document.session.headWorkspaceRevision !==
          request.expectedWorkspaceRevision
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
        output = {
          valid: validation.valid,
          workspaceRevision: validation.workspaceRevision,
          issues: validation.issues.map((issue) => ({
            code: issue.code,
            severity: issue.severity,
            message: issue.message,
            cardIds: issue.eventIds,
          })),
        }
      } else if (request.type === "draft.open") {
        output = await running.draftSession.open(request)
      } else if (request.type === "draft.get") {
        output = running.draftSession.get(request.draftId)
      } else if (isDraftMutationRequest(request)) {
        output = await running.draftSession.mutate(request)
      } else if (request.type === "draft.validate") {
        output = await running.draftSession.validate(request)
        const validation = output as Awaited<
          ReturnType<AgentDraftSession["validate"]>
        >
        await this.trace(running, {
          type: "validator.completed",
          spanId: randomUUID(),
          parentSpanId: toolSpanId,
          status: "OK",
          payload: {
            valid: validation.validation.valid,
            issueCodes: validation.validation.issues.map((issue) => issue.code),
            draft: true,
            repairsUsed: validation.validation.repairsUsed,
          },
        })
      } else if (request.type === "draft.prepare_transit") {
        output = await running.draftSession.prepareTransit(request)
      } else if (request.type === "draft.commit") {
        output = await running.draftSession.commit(request)
        running.requiresPlanValidation = true
      } else if (isPlaceToolRequest(request)) {
        output = await this.executePlaceTool(running, request, otelToolSpan)
      } else if (request.type === "hotel.search") {
        output = await this.executeHotelTool(running, request, otelToolSpan)
      } else {
        throw new WorkspaceInputError("Unsupported Agent tool request")
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
        },
      })
      otelToolSpan.setAttribute("output.value", redactedInput(output) ?? "")
      otelDraftSpan?.setAttribute("output.value", redactedInput(output) ?? "")
      if (output && typeof output === "object") {
        const semanticOutput = output as {
          status?: unknown
          count?: unknown
          warnings?: Array<{ code?: unknown }>
        }
        if (typeof semanticOutput.status === "string") {
          otelToolSpan.setAttribute(
            "periplus.tool.outcome",
            semanticOutput.status
          )
        } else if (
          request.type === "hotel.search" &&
          typeof semanticOutput.count === "number"
        ) {
          otelToolSpan.setAttribute(
            "periplus.tool.outcome",
            semanticOutput.count > 0 ? "candidates" : "empty"
          )
        }
        const warnings = Array.isArray(semanticOutput.warnings)
          ? semanticOutput.warnings
          : []
        otelToolSpan.setAttribute(
          "periplus.tool.warning_count",
          warnings.length
        )
        const warningCodes = warnings.flatMap((warning) =>
          typeof warning.code === "string" ? [warning.code] : []
        )
        if (warningCodes.length) {
          otelToolSpan.setAttribute(
            "periplus.tool.warning_codes",
            warningCodes.join(",")
          )
        }
      }
      if (otelDraftSpan && request.type === "draft.validate") {
        const result = output as Awaited<
          ReturnType<AgentDraftSession["validate"]>
        >
        otelDraftSpan.setAttribute(
          "periplus.validation.valid",
          result.validation.valid
        )
        otelDraftSpan.setAttribute(
          "periplus.validation.repairs_used",
          result.validation.repairsUsed
        )
      }
      if (otelDraftSpan && request.type === "draft.commit") {
        const result = output as Awaited<
          ReturnType<AgentDraftSession["commit"]>
        >
        otelDraftSpan.setAttribute(
          "periplus.command.name",
          "journey.apply_draft"
        )
        otelDraftSpan.setAttribute(
          "periplus.workspace.revision",
          result.newWorkspaceRevision
        )
      }
      otelDraftSpan?.end("OK")
      running.telemetry.recordTool(
        request.type,
        request.type === "place.fallback"
          ? "agent_fallback"
          : request.type.startsWith("place.")
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
      otelDraftSpan?.recordException(error)
      otelDraftSpan?.end("ERROR", {
        "error.type": error instanceof Error ? error.name : "Error",
      })
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
        request.type === "place.fallback"
          ? "agent_fallback"
          : request.type.startsWith("place.")
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
    } finally {
      markToolComplete()
      running.inFlightTools.delete(toolCompletion)
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
      signal: running.toolAbortController.signal,
    }
    if (request.type === "place.search") {
      const rawInput = withoutToolType(request)
      const parsed = placeSearchInputSchema.parse(rawInput)
      const input = withoutRequestId(parsed)
      const result = await this.withProviderSpan(
        running,
        parentSpan,
        "amap",
        "place.search",
        () =>
          this.placeService.searchPlaces(
            {
              ...input,
              includeLiveProvider: true,
              coordinatePreference: "auto",
            },
            usageContext
          )
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
      return {
        results: result.results.map((candidate) => ({
          candidateId: candidate.id,
          name: candidate.name,
          city: candidate.city ?? candidate.province,
          category: candidate.category,
          confidence: candidate.confidence,
          address: candidate.address,
        })),
        warnings: result.warnings,
      }
    }

    if (request.type === "place.resolve") {
      const rawInput = withoutToolType(request)
      const parsed = placeResolveInputSchema.parse(rawInput)
      const input = withoutRequestId(parsed)
      const result = await this.withProviderSpan(
        running,
        parentSpan,
        "amap",
        "place.resolve",
        () => this.placeService.resolvePlace(input, usageContext)
      )
      if (result.status === "resolved") {
        const placeResolutionId =
          running.draftSession.registerResolvedPlace(result)
        return {
          status: "resolved" as const,
          placeResolutionId,
          place: {
            canonicalName: result.placeRef.canonicalName,
            city: result.placeRef.city,
            address: result.placeRef.address,
            confidence: result.placeRef.confidence,
            coordinateSystem: result.placeRef.coordinateSystem,
          },
          warnings: result.warnings,
        }
      }
      if (result.status === "ambiguous") {
        running.draftSession.requireUserInput(result.question)
        return {
          status: "ambiguous" as const,
          candidates: result.candidates.map((candidate) => ({
            candidateId: candidate.id,
            name: candidate.name,
            city: candidate.city ?? candidate.province,
            confidence: candidate.confidence,
          })),
          question: result.question,
          warnings: result.warnings,
        }
      }
      if (result.fallbackAllowed) {
        running.draftSession.allowPlaceFallback(
          request.requestId,
          { text: input.text, city: input.city },
          result.warnings
        )
      } else {
        running.draftSession.requireUserInput(result.reason)
      }
      return {
        status: "not_found" as const,
        fallbackQuery: {
          query: input.text,
          city: input.city,
        },
        reason: result.reason,
        fallbackAllowed: result.fallbackAllowed,
        warnings: result.warnings,
      }
    }

    if (request.type === "place.fallback") {
      const rawInput = withoutToolType(request)
      const parsed = placeFallbackInputSchema.parse(rawInput)
      const fallback = running.draftSession.registerFallbackPlace(parsed)
      return {
        status: "fallback_registered" as const,
        placeResolutionId: fallback.placeResolutionId,
        place: {
          canonicalName: fallback.place.name,
          city: fallback.place.city,
          address: fallback.place.address,
          confidence: fallback.place.confidence,
          coordinateSystem: fallback.place.bestCoordinate.coordinateSystem,
          verificationStatus: "UNVERIFIED" as const,
        },
        warnings: [fallback.warning],
      }
    }

    const rawInput = withoutToolType(request)
    const parsed = placeEnrichInputSchema.parse(rawInput)
    const evidence = running.draftSession.getPlaceEvidence(
      parsed.placeResolutionId
    )
    const result = evidence.place.placeId
      ? await this.withProviderSpan(
          running,
          parentSpan,
          "amap",
          "place.enrich",
          () =>
            this.placeService.enrichPlace(
              {
                placeId: evidence.place.placeId,
                fields: parsed.fields,
              },
              usageContext
            )
        )
      : await this.withProviderSpan(
          running,
          parentSpan,
          "amap",
          "place.image.verify",
          () =>
            this.placeService.verifyPlaceImages(
              evidence.place.images ?? [],
              running.toolAbortController.signal
            )
        )
    const images =
      "results" in result
        ? result.matchStatus === "AUTO_APPROVED"
          ? (result.results[0]?.images ?? [])
          : []
        : result.images
    const warnings = [...result.warnings]
    if (
      !images.length &&
      !warnings.some((warning) => warning.code === "IMAGE_UNAVAILABLE")
    ) {
      warnings.push({
        provider: "periplus",
        code: "IMAGE_UNAVAILABLE",
        message: "当前地点没有可安全使用的图片",
      })
    }
    running.draftSession.enrichResolvedPlace(parsed.placeResolutionId, images)
    return {
      placeResolutionId: parsed.placeResolutionId,
      images: images.map((image) => ({
        provider: image.provider,
        url: image.url,
        fetchedAt: image.fetchedAt,
        width: image.width,
        height: image.height,
      })),
      warnings,
    }
  }

  private async executeHotelTool(
    running: RunningAgent,
    request: HotelAgentToolRequest,
    parentSpan: TelemetrySpan
  ) {
    const rawInput = withoutToolType(request)
    const parsed = hotelSearchInputSchema.parse(rawInput)
    const input = withoutRequestId(parsed)
    const usageContext: HotelProviderUsageContext = {
      userId: running.context.userId,
      workspaceId: running.workspaceId,
      agentRunId: running.runId,
      requestId: request.requestId,
      signal: running.toolAbortController.signal,
    }
    const result = await this.withProviderSpan(
      running,
      parentSpan,
      "rollinggo",
      "hotel.search",
      () => this.hotelService.searchHotels(input, usageContext)
    )
    const firstCandidate = result.candidates[0]
    if (!firstCandidate) {
      running.draftSession.requireUserInput(
        "酒店查询没有返回可用候选，需要用户补充酒店名称或条件"
      )
    }
    const hotelSelectionId = firstCandidate
      ? running.draftSession.registerHotelSelection(
          firstCandidate,
          result.warnings
        )
      : undefined
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
      hotelSelectionId,
      firstCandidate: firstCandidate
        ? {
            name: firstCandidate.name,
            address: firstCandidate.address,
            startingPrice: firstCandidate.startingPrice,
          }
        : undefined,
      warnings: result.warnings,
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
      const output =
        result && typeof result === "object"
          ? (result as {
              status?: unknown
              matchStatus?: unknown
              candidates?: unknown[]
              warnings?: Array<{
                provider?: unknown
                code?: unknown
                attempts?: unknown
              }>
              providerAttempts?: unknown
            })
          : undefined
      if (typeof output?.status === "string") {
        span.setAttribute("periplus.provider.outcome", output.status)
      } else if (typeof output?.matchStatus === "string") {
        span.setAttribute("periplus.provider.outcome", output.matchStatus)
      } else if (Array.isArray(output?.candidates)) {
        span.setAttribute(
          "periplus.provider.outcome",
          output.candidates.length > 0 ? "candidates" : "empty"
        )
      }
      const warnings = Array.isArray(output?.warnings) ? output.warnings : []
      const failureWarnings = warnings.filter(
        (warning) =>
          typeof warning.code === "string" &&
          (warning.provider === undefined || warning.provider === provider) &&
          warning.code !== "low_confidence" &&
          warning.code !== "IMAGE_UNAVAILABLE" &&
          warning.code !== "UNVERIFIED_FALLBACK"
      )
      span.end(failureWarnings.length ? "ERROR" : "OK", {
        "periplus.provider.warning_count": warnings.length,
        "periplus.provider.failure_count": failureWarnings.length,
        "periplus.provider.attempts": Math.max(
          typeof output?.providerAttempts === "number"
            ? output.providerAttempts
            : 1,
          ...failureWarnings.flatMap((warning) =>
            typeof warning.attempts === "number" ? [warning.attempts] : []
          )
        ),
        ...(failureWarnings[0]?.code
          ? {
              "periplus.provider.failure_code": String(failureWarnings[0].code),
            }
          : {}),
      })
      return result
    } catch (error) {
      span.end("ERROR", {
        "error.type": error instanceof Error ? error.name : "Error",
      })
      throw error
    }
  }

  private persistAssistantOutput(
    running: RunningAgent,
    text: string,
    emit: AgentEventEmitter
  ) {
    if (running.failureCode === "OUTPUT_PERSIST_FAILED") return
    running.assistantOutputBuffer += text
    if (
      Buffer.byteLength(running.assistantOutputBuffer, "utf8") >=
      OUTPUT_FLUSH_BYTES
    ) {
      this.flushAssistantOutput(running, emit)
      return
    }
    if (running.assistantOutputFlushTimer) return
    running.assistantOutputFlushTimer = setTimeout(() => {
      running.assistantOutputFlushTimer = null
      this.flushAssistantOutput(running, emit)
    }, OUTPUT_FLUSH_DELAY_MS)
    running.assistantOutputFlushTimer.unref?.()
  }

  private flushAssistantOutput(running: RunningAgent, emit: AgentEventEmitter) {
    if (running.assistantOutputFlushTimer) {
      clearTimeout(running.assistantOutputFlushTimer)
    }
    running.assistantOutputFlushTimer = null
    const text = running.assistantOutputBuffer
    running.assistantOutputBuffer = ""
    if (!text || running.failureCode === "OUTPUT_PERSIST_FAILED") return
    running.outputWrite = running.outputWrite
      .then(async () => {
        const persistStartedAt = performance.now()
        try {
          const persisted = await appendWorkspaceMessageDelta(
            running.context,
            running.workspaceId,
            running.assistantMessageId,
            running.runId,
            text,
            this.now()
          )
          if (!persisted) {
            throw new Error("Workspace message was not found")
          }
        } catch (error) {
          this.failOutputPersistence(running, error, emit)
          return
        }
        running.telemetry.recordStreamPersistence(
          text,
          performance.now() - persistStartedAt,
          this.now()
        )
        running.assistantOutput += text
        try {
          await this.heartbeat(running)
        } catch (error) {
          running.runtimeFailed = true
          running.failureCode ??= "AGENT_HEARTBEAT_FAILED"
          running.failureMessage ??=
            error instanceof Error ? error.message : "Agent heartbeat failed"
          running.toolAbortController.abort()
          running.harnessRun?.cancel()
        }
        emit(running.workspaceId, {
          type: "agent.message.delta",
          payload: {
            runId: running.runId,
            messageId: running.assistantMessageId,
            text,
          },
        })
      })
      .catch((error) => this.failOutputPersistence(running, error, emit))
  }

  private failOutputPersistence(
    running: RunningAgent,
    error: unknown,
    emit: AgentEventEmitter
  ) {
    if (running.failureCode === "OUTPUT_PERSIST_FAILED") return
    running.runtimeFailed = true
    running.failureCode = "OUTPUT_PERSIST_FAILED"
    running.failureMessage = "Agent output persistence failed"
    running.telemetry.root.recordException(error)
    running.telemetry.root.addEvent("output.persistence.failed", {
      "error.type": error instanceof Error ? error.name : "Error",
    })
    running.toolAbortController.abort()
    running.harnessRun?.cancel()
    emit(running.workspaceId, {
      type: "agent.run.failed",
      payload: {
        runId: running.runId,
        code: running.failureCode,
        message: running.failureMessage,
      },
    })
  }

  private async settleInFlightTools(running: RunningAgent) {
    running.toolAbortController.abort()
    while (running.inFlightTools.size) {
      await Promise.allSettled([...running.inFlightTools])
    }
  }

  private startHeartbeat(running: RunningAgent) {
    if (this.heartbeatIntervalMs === null) return
    running.heartbeatTimer = setInterval(() => {
      void this.heartbeat(running).catch((error) => {
        running.runtimeFailed = true
        running.failureCode ??= "AGENT_HEARTBEAT_FAILED"
        running.failureMessage ??=
          error instanceof Error ? error.message : "Agent heartbeat failed"
        running.toolAbortController.abort()
        running.harnessRun?.cancel()
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

  private releaseRuntime(running: RunningAgent) {
    if (running.heartbeatTimer) clearInterval(running.heartbeatTimer)
    running.heartbeatTimer = null
    if (running.assistantOutputFlushTimer) {
      clearTimeout(running.assistantOutputFlushTimer)
    }
    running.assistantOutputFlushTimer = null
    this.runs.delete(running.workspaceId)
  }

  private async finish(
    running: RunningAgent,
    mode: AgentMode,
    result: PeriplusAgentHarnessResult,
    emit: AgentEventEmitter
  ) {
    if (running.finished) return
    running.finished = true
    if (running.heartbeatTimer) clearInterval(running.heartbeatTimer)
    running.heartbeatTimer = null
    this.flushAssistantOutput(running, emit)

    running.cancelled ||= result.status === "cancelled"
    let failed = running.runtimeFailed || result.status === "failed"
    if (result.error) {
      running.failureCode ??= "AGENT_HARNESS_FAILED"
      running.failureMessage ??= result.error.message
      running.telemetry.root.recordException(result.error)
    }
    let validationErrorCode: string | undefined
    try {
      await running.outputWrite
      failed ||= running.runtimeFailed
      await this.settleInFlightTools(running)
      if (mode === "suggest" && !failed && !running.cancelled) {
        const suggestion = parseSuggestion(running.assistantOutput)
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
          "journey.validate_current.final",
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
      running.failureCode ??= "AGENT_FINISH_FAILED"
      running.failureMessage ??=
        error instanceof Error ? error.message : "Agent output failed"
      running.telemetry.root.recordException(error)
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
                ? (running.failureCode ??
                  validationErrorCode ??
                  "AGENT_HARNESS_FAILED")
                : undefined,
              errorMessage:
                running.failureMessage ?? validationErrorCode ?? undefined,
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
          runtimeId: this.harness.id,
          ...(running.failureCode ? { errorCode: running.failureCode } : {}),
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
      for (const span of running.modelSpans.values()) {
        span.end("ERROR", { "error.type": "AgentRunEnded" })
      }
      running.modelSpans.clear()
      if (result.status === "failed" && !running.runtimeFailed) {
        running.telemetry.recordRuntimeError("harness_failed")
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
        failed || running.cancelled ? "" : running.assistantOutput,
        {
          "periplus.agent.runtime": this.harness.id,
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
        runtimeId: this.harness.id,
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
      running.telemetry.finish("ERROR", "", {
        "periplus.agent.error_type":
          error instanceof Error ? error.name : "Error",
      })
      this.releaseRuntime(running)
    }
    emit(running.workspaceId, {
      type: "agent.run.failed",
      payload: {
        runId: running.runId,
        runtimeId: this.harness.id,
        ...(running.telemetry.traceId
          ? { traceId: running.telemetry.traceId }
          : {}),
        message:
          error instanceof Error ? error.message : "Agent runtime failed",
      },
    })
  }
}
