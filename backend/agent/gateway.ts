import { randomUUID } from "node:crypto"
import type { AuthContext } from "@/modules/auth/server/context"
import { coordinateDistanceMeters } from "@/lib/places/coordinates"
import { endpointToGcj02 } from "@/lib/journeys/coordinates"
import { normalizePlaceName } from "@/lib/places/normalize"
import { WORKSPACE_AGENT_RUN_LEASE_SECONDS } from "@/modules/data-model/contracts"
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
  failWorkspaceAgentContextCheckpoint,
  finishWorkspaceAgentRun,
  getWorkspaceAgentContextCheckpoint,
  heartbeatWorkspaceAgentRun,
  reconcileExpiredWorkspaceAgentRun,
  saveWorkspaceAgentContextCheckpoint,
  startWorkspaceAgentContextCheckpointAttempt,
  startWorkspaceAgentRun,
  WorkspaceInputError,
  WorkspaceRevisionConflictError,
} from "@/modules/data/workspaces/workspace-repository"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"
import type { AgentEventEmitter } from "../types"
import { buildPrompt, promptVersion } from "./prompt"
import type {
  PeriplusAgentHarness,
  PeriplusAgentHarnessResult,
  PeriplusAgentHarnessRun,
  PeriplusHarnessEvent,
  PersistedAgentMessage,
} from "./periplus-agent-harness"
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
import { AgentDraftSession } from "./draft-session"
import { buildPlannerBaseline, type PlannerBaseline } from "./planner-baseline"
import {
  agentToolRequestSchema,
  ok,
  retryableError,
  terminalError,
  type AgentToolRequest,
  type ParsedAgentToolRequest,
} from "./tool-contract"

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
  externalToolSpans: Map<string, TelemetrySpan>
  toolCallResults: Map<string, { fingerprint: string; result: unknown }>
  requiresPlanValidation: boolean
  committedRevision: number | null
  committedProjectionHash: string | null
  baseline: PlannerBaseline
  draftSession: AgentDraftSession
  currentUserRequest: string
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

function summarySourceMessages(
  document: NonNullable<
    Awaited<ReturnType<WorkspaceCommandService["getDocument"]>>
  >,
  sourceRunId: string,
  throughMessageId: string
) {
  const sourceRun = document.agentRuns.find((run) => run.id === sourceRunId)
  const throughIndex = document.messages.findIndex(
    (message) => message.id === throughMessageId
  )
  if (!sourceRun || throughIndex < 0) return []
  return conversationMessages({
    ...document,
    messages: document.messages
      .slice(0, throughIndex + 1)
      .filter(
        (message) =>
          message.createdAt >= sourceRun.startedAt &&
          (message.role === "USER" || message.agentRunId === sourceRunId)
      ),
  })
}

const OUTPUT_FLUSH_DELAY_MS = 50
const OUTPUT_FLUSH_BYTES = 512
const SUMMARY_ATTEMPT_TIMEOUT_MS = 20_000

function adultCountFromRequest(request: string) {
  const match = request.match(
    /(?:^|[^\d])(\d{1,2})\s*(?:位?成人|名成人|个大人|大人|人(?:同行|出行|入住)?)/
  )
  if (!match) return 1
  return Math.min(10, Math.max(1, Number(match[1])))
}

function hotelPreference(
  currentUserRequest: string,
  toolPreference: string | undefined
) {
  const budgetSource = `${currentUserRequest}\n${toolPreference ?? ""}`
  const budgetMatch = budgetSource.match(
    /(?:预算|不超过|不高于|低于|以内|以下|<=?)\s*[¥￥]?\s*(\d+(?:\.\d+)?)/
  )
  const requestTerms = Array.from(
    currentUserRequest.matchAll(
      /([\p{Script=Han}A-Za-z0-9·]{2,30}(?:酒店|宾馆|客栈|民宿))|([\p{Script=Han}A-Za-z0-9·]{2,20})(?:附近|周边|一带)/gu
    )
  ).flatMap((match) => [match[1], match[2]].filter(Boolean) as string[])
  const termsSource = requestTerms.length
    ? requestTerms.join(" ")
    : (toolPreference ?? "")
  const terms = normalizePlaceName(termsSource)
    .split(/[\s,，;；、/]+/)
    .filter(
      (term) =>
        term.length >= 2 &&
        !/^(酒店|住宿|预算|以内|以下|附近|周边|靠近)$/.test(term) &&
        !/^\d+(?:\.\d+)?(?:元)?$/.test(term)
    )
  return {
    terms,
    searchText: terms.join(" ") || toolPreference,
    ...(budgetMatch
      ? { maximumPrice: Number(budgetMatch[1]), maximumPriceCurrency: "CNY" }
      : {}),
  }
}

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

  private defaultTripStartDate() {
    const date = new Date(this.now().getTime() + 86_400_000)
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date)
  }

  private async waitForCheckpoint(
    context: AuthContext,
    workspaceId: string,
    sourceRunId: string,
    throughMessageId: string
  ) {
    const deadline = Date.now() + SUMMARY_ATTEMPT_TIMEOUT_MS
    while (Date.now() < deadline) {
      const checkpoint = await getWorkspaceAgentContextCheckpoint(
        context,
        workspaceId
      )
      if (
        checkpoint?.sourceRunId !== sourceRunId ||
        checkpoint.throughMessageId !== throughMessageId ||
        checkpoint.status !== "PENDING"
      ) {
        return checkpoint
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return getWorkspaceAgentContextCheckpoint(context, workspaceId)
  }

  private async generateSummaryCheckpoint(
    context: AuthContext,
    workspaceId: string,
    sourceRunId: string,
    throughMessageId: string,
    messages: PersistedAgentMessage[]
  ) {
    const previous = await getWorkspaceAgentContextCheckpoint(
      context,
      workspaceId
    )
    const attempt = await startWorkspaceAgentContextCheckpointAttempt(
      context,
      workspaceId,
      { sourceRunId, throughMessageId },
      this.now()
    )
    if (!attempt) throw new WorkspaceInputError("Workspace was not found")
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      SUMMARY_ATTEMPT_TIMEOUT_MS
    )
    timeout.unref?.()
    try {
      const summary = await this.harness.generateConversationSummary(
        messages,
        previous?.status === "READY" ||
          (previous?.sourceRunId === sourceRunId && previous.summary)
          ? previous.summary
          : undefined,
        controller.signal
      )
      await saveWorkspaceAgentContextCheckpoint(
        context,
        workspaceId,
        {
          sourceRunId,
          throughMessageId,
          summary,
          attemptCount: attempt.attemptCount,
        },
        this.now()
      )
      return summary
    } catch (error) {
      await failWorkspaceAgentContextCheckpoint(
        context,
        workspaceId,
        {
          sourceRunId,
          throughMessageId,
          error: error instanceof Error ? error.message : "Summary failed",
          attemptCount: attempt.attemptCount,
        },
        this.now()
      )
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  private async ensureConversationSummary(
    context: AuthContext,
    workspaceId: string,
    document: NonNullable<
      Awaited<ReturnType<WorkspaceCommandService["getDocument"]>>
    >,
    telemetry: AgentRunTelemetry
  ) {
    const terminalRuns = document.agentRuns
      .filter((run) => run.status !== "RUNNING")
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    const source = terminalRuns
      .map((run) => ({
        run,
        throughMessage: document.messages.find(
          (message) =>
            message.role === "ASSISTANT" && message.agentRunId === run.id
        ),
      }))
      .find((candidate) => candidate.throughMessage)
    if (!source?.throughMessage) return ""
    const sourceRun = source.run
    const throughMessage = source.throughMessage
    let checkpoint = await getWorkspaceAgentContextCheckpoint(
      context,
      workspaceId
    )
    const exact =
      checkpoint?.sourceRunId === sourceRun.id &&
      checkpoint.throughMessageId === throughMessage.id
    if (exact && checkpoint?.status === "READY") {
      return checkpoint.summary ?? "{}"
    }
    if (exact && checkpoint?.status === "PENDING") {
      checkpoint = await this.waitForCheckpoint(
        context,
        workspaceId,
        sourceRun.id,
        throughMessage.id
      )
      if (checkpoint?.status === "READY") return checkpoint.summary ?? "{}"
    }
    if (exact && (checkpoint?.attemptCount ?? 0) >= 2) {
      throw new WorkspaceInputError("SUMMARY_UNAVAILABLE")
    }
    const span = telemetry.startSpan(
      "agent.summary.retry",
      OpenInferenceSpanKind.CHAIN,
      {
        "periplus.summary.source_run_id": sourceRun.id,
        "periplus.summary.attempt": (checkpoint?.attemptCount ?? 0) + 1,
      }
    )
    try {
      const summary = await telemetry.withSpan(span, () =>
        this.generateSummaryCheckpoint(
          context,
          workspaceId,
          sourceRun.id,
          throughMessage.id,
          summarySourceMessages(document, sourceRun.id, throughMessage.id)
        )
      )
      span.end("OK")
      return summary
    } catch (error) {
      span.recordException(error)
      span.end("ERROR")
      throw new WorkspaceInputError("SUMMARY_UNAVAILABLE")
    }
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
    emit: AgentEventEmitter
  ) {
    const runId = randomUUID()
    const telemetry = startAgentRunTelemetry({
      workspaceId,
      userId: context.userId,
      runId,
      mode: "auto",
      runtimeId: this.harness.id,
      promptVersion: promptVersion(),
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
    try {
      const userMessageSpan = telemetry.startSpan(
        "workspace.message.user.persist",
        OpenInferenceSpanKind.CHAIN,
        { "periplus.message.role": "user" }
      )
      try {
        const userMessage = await telemetry.withSpan(userMessageSpan, () =>
          appendWorkspaceMessage(context, workspaceId, {
            role: "USER",
            content: prompt,
          })
        )
        if (!userMessage) {
          throw new WorkspaceInputError("User message could not be created")
        }
        userMessageSpan.end("OK", {
          "periplus.message.length": prompt.length,
          "periplus.message.id": userMessage.id,
        })
      } catch (error) {
        userMessageSpan.recordException(error)
        userMessageSpan.end("ERROR")
        throw error
      }
    } catch (error) {
      await finishWorkspaceAgentRun(context, workspaceId, persistedRun.id, {
        status: "FAILED",
        errorCode: "AGENT_MESSAGE_FAILED",
        errorMessage:
          error instanceof Error ? error.message : "User message failed",
        runtimeOwnerId: this.runtimeOwnerId,
        now: this.now(),
      })
      telemetry.finish(
        "ERROR",
        error instanceof Error ? error.message : "User message failed"
      )
      throw error
    }
    let conversationSummary = ""
    try {
      conversationSummary = await this.ensureConversationSummary(
        context,
        workspaceId,
        initial,
        telemetry
      )
    } catch (error) {
      await finishWorkspaceAgentRun(context, workspaceId, persistedRun.id, {
        status: "FAILED",
        errorCode: "SUMMARY_UNAVAILABLE",
        errorMessage:
          error instanceof Error ? error.message : "Summary is unavailable",
        runtimeOwnerId: this.runtimeOwnerId,
        now: this.now(),
      })
      this.finishRejectedTelemetry(
        telemetry,
        "SUMMARY_UNAVAILABLE",
        error instanceof Error ? error.message : "Summary is unavailable"
      )
      emit(workspaceId, {
        type: "agent.run.failed",
        payload: {
          runId: persistedRun.id,
          code: "SUMMARY_UNAVAILABLE",
          message: "对话摘要暂不可用，本次规划未开始",
        },
      })
      return
    }
    let assistantMessageId: string
    try {
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
    let baseline: PlannerBaseline
    try {
      const baselineDocument = await this.withTelemetrySpan(
        telemetry,
        "agent.baseline.load",
        () => this.commands.getDocument(context, workspaceId)
      )
      if (!baselineDocument) {
        throw new WorkspaceInputError("Workspace was not found")
      }
      baseline = buildPlannerBaseline({
        workspaceId,
        workspaceRevision: baselineDocument.session.headWorkspaceRevision,
        graph: baselineDocument.session.headGraph,
      })
    } catch (error) {
      try {
        await finishWorkspaceAgentRun(context, workspaceId, persistedRun.id, {
          status: "FAILED",
          errorCode: "BASELINE_PREPARE_FAILED",
          errorMessage:
            error instanceof Error
              ? error.message
              : "Baseline preparation failed",
          runtimeOwnerId: this.runtimeOwnerId,
          now: this.now(),
        })
      } catch {
        // Preserve the baseline error when run terminalization also fails.
      }
      telemetry.finish(
        "ERROR",
        error instanceof Error ? error.message : "Baseline preparation failed"
      )
      throw error
    }
    telemetry.root.setAttributes({
      "periplus.baseline.revision": baseline.workspaceRevision,
      "periplus.baseline.projection_hash": baseline.projectionHash,
      "periplus.summary.status": conversationSummary ? "READY" : "EMPTY",
    })
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
      externalToolSpans: new Map(),
      toolCallResults: new Map(),
      requiresPlanValidation: false,
      committedRevision: null,
      committedProjectionHash: null,
      baseline,
      currentUserRequest: prompt,
      draftSession: new AgentDraftSession(
        workspaceId,
        persistedRun.id,
        context,
        this.commands,
        baseline.workspaceRevision
      ),
    }
    this.runs.set(workspaceId, running)
    this.startHeartbeat(running)

    try {
      await this.trace(running, {
        type: "run.started",
        spanId: running.traceRunSpanId,
        status: "OK",
        payload: { mode: "auto", runtimeId: this.harness.id },
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
        { "periplus.prompt.version": promptVersion() }
      )
      const runtimePrompt = buildPrompt()
      promptSpan.end("OK", {
        "periplus.prompt.length": runtimePrompt.length,
      })

      const runtimeStartSpan = running.telemetry.startSpan(
        "agent.runtime.start",
        OpenInferenceSpanKind.CHAIN,
        {
          "periplus.agent.runtime": this.harness.id,
          "periplus.agent.mode": "auto",
        }
      )
      try {
        running.telemetry.startRuntimeStream(runtimeStartSpan.context)
        const harnessRun = await running.telemetry.withSpan(
          runtimeStartSpan,
          () =>
            this.harness.start(
              {
                runId: running.runId,
                workspaceId,
                systemPrompt: runtimePrompt,
                conversationSummary,
                baseline,
                currentUserRequest: prompt,
                defaultTripStartDate: this.defaultTripStartDate(),
                executeTool: (request, toolCallId, signal) =>
                  this.executeTool(running, request, toolCallId, signal),
              },
              {
                onEvent: (event) =>
                  this.handleHarnessEvent(running, event, emit),
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
    event: PeriplusHarnessEvent,
    emit: AgentEventEmitter
  ) {
    if (event.type === "context_prepared") {
      running.telemetry.setPromptInput(event.input)
      running.telemetry.root.setAttributes({
        "periplus.context.message_count": event.messageCount,
        "periplus.context.estimated_tokens": event.estimatedTokens,
        "periplus.context.compacted": event.compacted,
        "periplus.summary.status": event.summaryStatus,
        "periplus.baseline.revision": event.baselineRevision,
        "periplus.tool_catalog.version": event.toolCatalogVersion,
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
          "periplus.prompt.version": promptVersion(),
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
      span.setAttribute(
        "output.value",
        redactedInput({ text: event.output, toolCalls: event.toolCalls }) ?? ""
      )
      span.end(
        event.stopReason === "error"
          ? "ERROR"
          : event.stopReason === "aborted"
            ? "CANCELLED"
            : "OK",
        {
          "llm.token_count.prompt": event.usage.input,
          "llm.token_count.completion": event.usage.output,
          "llm.token_count.total": event.usage.totalTokens,
          "llm.token_count.cache_read": event.usage.cacheRead,
          "llm.token_count.cache_write": event.usage.cacheWrite,
          "periplus.llm.duration_ms": event.endedAt - span.startedAt,
          "periplus.llm.stop_reason": event.stopReason,
        }
      )
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
        "periplus.tool.provider_name": event.providerToolName,
      })
      if (event.toolName === "web_search") {
        const span = running.telemetry.startSpan(
          "agent.tool",
          OpenInferenceSpanKind.TOOL,
          {
            [TOOL_NAME]: event.toolName,
            "periplus.tool.call_id": event.toolCallId,
            "periplus.tool.provider": "deepseek",
          },
          running.telemetry.context
        )
        span.setAttribute("input.value", redactedInput(event.args) ?? "")
        running.externalToolSpans.set(event.toolCallId, span)
      }
      return
    }
    if (event.type === "tool_end") {
      running.telemetry.root.addEvent("agent.tool.end", {
        "periplus.tool.call_id": event.toolCallId,
        "periplus.tool.name": event.toolName,
        "periplus.tool.provider_name": event.providerToolName,
        "periplus.tool.error": event.isError,
      })
      const span = running.externalToolSpans.get(event.toolCallId)
      if (span) {
        running.externalToolSpans.delete(event.toolCallId)
        span.setAttribute("output.value", redactedInput(event.result) ?? "")
        span.end(event.isError ? "ERROR" : "OK")
      }
      return
    }
    if (event.type === "run_end") {
      void this.finish(running, event.result, emit)
    }
  }

  cancel(workspaceId: string) {
    const running = this.runs.get(workspaceId)
    if (!running || running.finished) return
    running.cancelled = true
    running.toolAbortController.abort()
    running.harnessRun?.cancel()
  }

  private toolFailure(request: ParsedAgentToolRequest, error: unknown) {
    const message = error instanceof Error ? error.message : "Agent tool failed"
    if (error instanceof WorkspaceRevisionConflictError) {
      return terminalError("WORKSPACE_REVISION_CONFLICT", message)
    }
    if (message.startsWith("SAME_DAY_CITY_HAS_NO_STAY")) {
      return retryableError(
        "SAME_DAY_CITY_HAS_NO_STAY",
        "Skip hotel search and STAY for this same-day City"
      )
    }
    if (/COMMITTED|repair limit|SUMMARY_UNAVAILABLE/.test(message)) {
      return terminalError("DRAFT_TERMINAL", message)
    }
    return retryableError("INVALID_TOOL_INPUT", message, {
      tool: request.type,
    })
  }

  private async executeTool(
    running: RunningAgent,
    rawRequest: AgentToolRequest,
    toolCallId: string,
    signal?: AbortSignal
  ): Promise<unknown> {
    const parsedRequest = agentToolRequestSchema.safeParse(rawRequest)
    if (!parsedRequest.success) {
      return retryableError(
        "INVALID_ARGUMENTS",
        "Agent tool arguments do not match the canonical schema",
        parsedRequest.error.issues
      )
    }
    const request = parsedRequest.data
    const fingerprint = JSON.stringify(request)
    const replay = running.toolCallResults.get(toolCallId)
    if (replay) {
      if (replay.fingerprint === fingerprint) return replay.result
      running.runtimeFailed = true
      running.failureCode ??= "TOOL_CALL_ID_REUSED"
      running.failureMessage ??=
        "A toolCallId cannot be reused with different arguments"
      return terminalError("TOOL_CALL_ID_REUSED", running.failureMessage)
    }
    if (running.finished || running.runtimeFailed || signal?.aborted) {
      return terminalError(
        "RUN_NOT_ACTIVE",
        "Agent tool execution is no longer active"
      )
    }
    const toolSpanId = randomUUID()
    const startedAt = performance.now()
    const otelToolSpan = running.telemetry.startSpan(
      "agent.tool",
      OpenInferenceSpanKind.TOOL,
      { [TOOL_NAME]: request.type },
      running.telemetry.context
    )
    otelToolSpan.setAttribute("input.value", redactedInput(request) ?? "")
    let markToolComplete!: () => void
    const toolCompletion = new Promise<void>((resolve) => {
      markToolComplete = resolve
    })
    running.inFlightTools.add(toolCompletion)
    let result: unknown
    try {
      await this.trace(running, {
        type: "tool.started",
        spanId: toolSpanId,
        parentSpanId: running.traceRunSpanId,
        status: "OK",
        payload: { toolType: request.type, toolCallId },
      })
      await this.heartbeat(running)
      running.draftSession.assertToolAllowed(request.type)
      if (request.type === "draft.open") {
        result = ok(await running.draftSession.openCurrent(toolCallId))
      } else if (request.type === "city.add") {
        const resolved = await this.withProviderSpan(
          running,
          otelToolSpan,
          "amap",
          "city.resolve",
          () =>
            this.placeService.resolvePlace(
              { text: request.name, city: request.name },
              {
                userId: running.context.userId,
                workspaceId: running.workspaceId,
                agentRunId: running.runId,
                requestId: toolCallId,
                signal: running.toolAbortController.signal,
              }
            )
        )
        result =
          resolved.status === "resolved"
            ? ok(
                await running.draftSession.addCity(
                  request,
                  toolCallId,
                  resolved.placeRef
                )
              )
            : terminalError("CITY_NOT_FOUND", resolved.reason)
      } else if (request.type === "place.resolve") {
        result = await this.executeAutoPlaceResolve(
          running,
          request,
          toolCallId,
          otelToolSpan
        )
      } else if (request.type === "placeEvent.add") {
        result = ok(
          await running.draftSession.addPlaceEvent(request, toolCallId)
        )
      } else if (request.type === "hotel.search") {
        result = await this.executeAutoHotelSearch(
          running,
          request,
          toolCallId,
          otelToolSpan
        )
      } else if (request.type === "stay.add") {
        result = ok(await running.draftSession.addStay(request, toolCallId))
      } else if (request.type === "transit.add") {
        result = ok(await running.draftSession.addTransit(request, toolCallId))
      } else if (request.type === "card.update") {
        result = ok(await running.draftSession.updateCard(request, toolCallId))
      } else if (request.type === "card.move") {
        result = ok(await running.draftSession.moveCard(request, toolCallId))
      } else if (request.type === "card.remove") {
        result = ok(await running.draftSession.removeCard(request, toolCallId))
      } else if (request.type === "draft.project") {
        result = ok(
          running.draftSession.projectCurrent(request.scopeCityCardId)
        )
      } else if (request.type === "draft.validate") {
        const validation =
          await running.draftSession.validateCurrent(toolCallId)
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
        result = ok(validation)
      } else if (request.type === "draft.prepare_transit") {
        result = ok(
          await running.draftSession.prepareTransitCurrent(
            request.transitCardId,
            toolCallId
          )
        )
      } else if (request.type === "draft.commit") {
        const committed = await running.draftSession.commitCurrent(toolCallId)
        running.requiresPlanValidation = true
        running.committedRevision = committed.newWorkspaceRevision
        running.committedProjectionHash = committed.projectionHash
        result = ok(committed)
      }
    } catch (error) {
      result = this.toolFailure(request, error)
    }
    if (
      result &&
      typeof result === "object" &&
      "status" in result &&
      result.status === "terminal_error"
    ) {
      const terminal = result as {
        status: "terminal_error"
        code: string
        message: string
      }
      running.runtimeFailed = true
      running.failureCode ??= terminal.code
      running.failureMessage ??= terminal.message
    }
    const status =
      result &&
      typeof result === "object" &&
      "status" in result &&
      result.status === "ok"
        ? "OK"
        : "ERROR"
    try {
      await this.trace(running, {
        type: status === "OK" ? "tool.completed" : "tool.failed",
        spanId: toolSpanId,
        parentSpanId: running.traceRunSpanId,
        durationMs: performance.now() - startedAt,
        status,
        payload: { toolType: request.type, toolCallId },
      })
      otelToolSpan.setAttribute("output.value", redactedInput(result) ?? "")
      running.telemetry.recordTool(
        request.type,
        request.type === "place.resolve"
          ? "amap"
          : request.type === "hotel.search"
            ? "rollinggo"
            : "workspace",
        status,
        performance.now() - startedAt
      )
      otelToolSpan.end(status, {
        "periplus.tool.duration_ms": performance.now() - startedAt,
      })
      running.toolCallResults.set(toolCallId, { fingerprint, result })
      return result
    } finally {
      markToolComplete()
      running.inFlightTools.delete(toolCompletion)
    }
  }

  private async executeAutoPlaceResolve(
    running: RunningAgent,
    request: Extract<ParsedAgentToolRequest, { type: "place.resolve" }>,
    toolCallId: string,
    parentSpan: TelemetrySpan
  ) {
    const graph = running.draftSession.currentGraph()
    const city = graph.events.find(
      (event) =>
        event.id === request.cityCardId &&
        event.type === "SECTION" &&
        event.detail.kind === "CITY" &&
        event.placementStatus === "SCHEDULED" &&
        event.introducedRevision <= graph.revision &&
        (!event.retiredRevision || event.retiredRevision > graph.revision)
    )
    if (!city) {
      return retryableError(
        "CITY_NOT_FOUND",
        "cityCardId is not an active CITY"
      )
    }
    const intent =
      request.cardType === "MEAL"
        ? ("food" as const)
        : request.cardType === "ACTIVITY"
          ? ("performance" as const)
          : ("sightseeing" as const)
    const resolved = await this.withProviderSpan(
      running,
      parentSpan,
      "amap",
      "place.resolve",
      () =>
        this.placeService.resolvePlace(
          { text: request.query, city: city.title, intent },
          {
            userId: running.context.userId,
            workspaceId: running.workspaceId,
            agentRunId: running.runId,
            requestId: toolCallId,
            signal: running.toolAbortController.signal,
          }
        )
    )
    if (resolved.status !== "resolved") {
      return request.origin === "USER_EXPLICIT"
        ? terminalError("EXPLICIT_PLACE_NOT_FOUND", resolved.reason)
        : retryableError(
            "PLANNER_PLACE_NOT_FOUND",
            "No writable place matched; choose another concrete place name"
          )
    }
    const placeResolutionId =
      running.draftSession.registerResolvedPlace(resolved)
    return ok({
      placeResolutionId,
      canonicalName: resolved.placeRef.canonicalName,
      category: resolved.place.category,
      warnings: resolved.warnings,
    })
  }

  private async executeAutoHotelSearch(
    running: RunningAgent,
    request: Extract<ParsedAgentToolRequest, { type: "hotel.search" }>,
    toolCallId: string,
    parentSpan: TelemetrySpan
  ) {
    const preference = hotelPreference(
      running.currentUserRequest,
      request.preference
    )
    const context = running.draftSession.hotelSearchContext(
      request.cityCardId,
      preference.searchText,
      adultCountFromRequest(running.currentUserRequest)
    )
    const response = await this.withProviderSpan(
      running,
      parentSpan,
      "rollinggo",
      "hotel.search",
      () =>
        this.hotelService.searchHotels(context.providerInput, {
          userId: running.context.userId,
          workspaceId: running.workspaceId,
          agentRunId: running.runId,
          requestId: toolCallId,
          signal: running.toolAbortController.signal,
        })
    )
    const ranked = response.candidates
      .map((candidate, providerOrder) => {
        const coordinate = endpointToGcj02({
          name: candidate.name,
          lat: candidate.coordinates.lat,
          lng: candidate.coordinates.lng,
          coordinateSystem: "WGS84",
        })
        const distance = context.anchors.length
          ? context.anchors.reduce(
              (total, anchor) =>
                total + coordinateDistanceMeters(anchor, coordinate),
              0
            ) / context.anchors.length
          : 0
        const normalizedCandidate = normalizePlaceName(
          `${candidate.name} ${candidate.address ?? ""}`
        )
        const textPreferenceRank = preference.terms.length
          ? preference.terms.every((term) => normalizedCandidate.includes(term))
            ? 0
            : 1
          : 0
        const price = candidate.startingPrice?.amount
        const budgetPreferenceRank =
          preference.maximumPrice === undefined
            ? 0
            : candidate.startingPrice?.currency ===
                  preference.maximumPriceCurrency &&
                price !== undefined &&
                price <= preference.maximumPrice
              ? 0
              : 1
        return {
          candidate,
          providerOrder,
          distance,
          preferenceRank: textPreferenceRank * 2 + budgetPreferenceRank,
        }
      })
      .sort(
        (a, b) =>
          a.preferenceRank - b.preferenceRank ||
          a.distance - b.distance ||
          a.providerOrder - b.providerOrder ||
          a.candidate.providerHotelId.localeCompare(b.candidate.providerHotelId)
      )
    const selected = ranked[0]?.candidate
    if (!selected) {
      return retryableError(
        "HOTEL_NOT_FOUND",
        "No hotel candidate was returned for this overnight City"
      )
    }
    const hotelSelectionId = running.draftSession.registerHotelSelection(
      selected,
      response.warnings,
      context.schedule
    )
    await appendWorkspaceMessage(running.context, running.workspaceId, {
      role: "ASSISTANT",
      content: "",
      blocks: [
        {
          type: "hotel_search",
          title: `${context.cityName}酒店推荐`,
          fetchedAt: new Date().toISOString(),
          candidates: ranked.map(({ candidate }) => ({
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
    return ok({
      hotelSelectionId,
      selected: {
        name: selected.name,
        address: selected.address,
        checkInDate: context.providerInput.checkInDate,
        stayNights: context.providerInput.stayNights,
        adultCount: context.providerInput.adultCount,
      },
      warnings: response.warnings,
    })
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
          warning.code !== "IMAGE_UNAVAILABLE"
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
    if (running.failureCode?.endsWith("PERSIST_FAILED")) return
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
    if (!text || running.failureCode?.endsWith("PERSIST_FAILED")) return
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
    if (
      running.failureCode === "OUTPUT_PERSIST_FAILED" ||
      running.failureCode === "POST_COMMIT_PERSIST_FAILED"
    )
      return
    running.runtimeFailed = true
    running.failureCode = running.requiresPlanValidation
      ? "POST_COMMIT_PERSIST_FAILED"
      : "OUTPUT_PERSIST_FAILED"
    running.failureMessage = running.requiresPlanValidation
      ? "Workspace committed, but the assistant reply could not be persisted"
      : "Agent output persistence failed"
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
      if (running.requiresPlanValidation) {
        if (running.committedRevision === null) {
          throw new WorkspaceInputError(
            "Committed run is missing its Workspace revision"
          )
        }
        const document = await this.commands.getDocument(
          running.context,
          running.workspaceId
        )
        if (!document) throw new WorkspaceInputError("Workspace was not found")
        const validationSpan = running.telemetry.startSpan(
          "agent.final_head_gate",
          OpenInferenceSpanKind.CHAIN
        )
        const finalValidation = validateJourneyPlan({
          graph: document.session.headGraph,
          workspaceRevision: document.session.headWorkspaceRevision,
        })
        const passed =
          finalValidation.valid &&
          running.committedRevision === finalValidation.workspaceRevision &&
          running.committedProjectionHash === finalValidation.projectionHash
        validationSpan.end(passed ? "OK" : "ERROR", {
          "periplus.validation.valid": finalValidation.valid,
          "periplus.validation.passed": passed,
          "periplus.workspace.revision": finalValidation.workspaceRevision,
        })
        await this.trace(running, {
          type: "validator.completed",
          spanId: randomUUID(),
          parentSpanId: running.traceRunSpanId,
          status: passed ? "OK" : "ERROR",
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
          validationErrorCode = "POST_COMMIT_INVARIANT_FAILED"
          running.failureCode ??= validationErrorCode
          running.failureMessage ??= validationErrorCode
          emit(running.workspaceId, {
            type: "agent.run.failed",
            payload: {
              runId: running.runId,
              code: validationErrorCode,
              validation: finalValidation,
            },
          })
        }
      } else if (!failed && !running.cancelled) {
        failed = true
        validationErrorCode = "DRAFT_COMMIT_REQUIRED"
        running.failureCode ??= validationErrorCode
        running.failureMessage ??=
          "AUTO run ended without committing a VALID draft"
      }
    } catch (error) {
      failed = true
      running.failureCode ??= running.requiresPlanValidation
        ? "POST_COMMIT_INVARIANT_FAILED"
        : "AGENT_FINISH_FAILED"
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
      void this.scheduleConversationSummary(running)
    } catch (error) {
      failed = true
      running.failureCode ??= running.requiresPlanValidation
        ? "POST_COMMIT_PERSIST_FAILED"
        : "AGENT_FINISH_PERSIST_FAILED"
      running.failureMessage ??=
        error instanceof Error ? error.message : "Agent finish failed"
      emit(running.workspaceId, {
        type: "agent.run.failed",
        payload: {
          runId: running.runId,
          code: running.failureCode,
          message:
            error instanceof Error ? error.message : "Agent finish failed",
        },
      })
    } finally {
      for (const span of running.modelSpans.values()) {
        span.end("ERROR", { "error.type": "AgentRunEnded" })
      }
      running.modelSpans.clear()
      for (const span of running.externalToolSpans.values()) {
        span.end("ERROR", { "error.type": "AgentRunEnded" })
      }
      running.externalToolSpans.clear()
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
      running.failureCode ??= running.requiresPlanValidation
        ? "POST_COMMIT_PERSIST_FAILED"
        : "WORKSPACE_UNLOCK_FAILED"
      running.failureMessage ??=
        error instanceof Error ? error.message : "Workspace unlock failed"
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

  private async scheduleConversationSummary(running: RunningAgent) {
    try {
      const document = await this.commands.getDocument(
        running.context,
        running.workspaceId
      )
      if (!document) return
      const throughMessage = document.messages.find(
        (message) => message.id === running.assistantMessageId
      )
      if (!throughMessage) return
      const checkpoint = await getWorkspaceAgentContextCheckpoint(
        running.context,
        running.workspaceId
      )
      if (
        checkpoint?.sourceRunId === running.runId &&
        checkpoint.throughMessageId === throughMessage.id &&
        ["PENDING", "READY"].includes(checkpoint.status)
      ) {
        return
      }
      await this.generateSummaryCheckpoint(
        running.context,
        running.workspaceId,
        running.runId,
        throughMessage.id,
        summarySourceMessages(document, running.runId, throughMessage.id)
      )
    } catch (error) {
      running.telemetry.root.addEvent("summary.background.failed", {
        "error.type": error instanceof Error ? error.name : "Error",
      })
    }
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
