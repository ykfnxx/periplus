import { randomUUID } from "node:crypto"
import { join } from "node:path"
import type { AuthContext } from "@/modules/auth/server/context"
import {
  placeEnrichInputSchema,
  placeResolveForJourneyEventInputSchema,
  placeResolveInputSchema,
  placeSearchInputSchema,
} from "@/backend/mcp/schemas/place"
import {
  targetCommandBodySchema,
  WORKSPACE_AGENT_RUN_LEASE_SECONDS,
  type TargetCommandEnvelope,
  type TargetProjectionMode,
} from "@/modules/data-model/contracts"
import { resolveJourneyProjection } from "@/modules/data/journeys/journey-projection"
import {
  createPlaceIntelligenceService,
  type PlaceIntelligenceService,
  type PlaceProviderUsageContext,
} from "@/modules/data/places/place-service"
import {
  appendWorkspaceMessage,
  createWorkspaceSuggestion,
  finishWorkspaceAgentRun,
  heartbeatWorkspaceAgentRun,
  reconcileExpiredWorkspaceAgentRun,
  startWorkspaceAgentRun,
  WorkspaceInputError,
} from "@/modules/data/workspaces/workspace-repository"
import { WorkspaceCommandService } from "@/modules/workspace/server/workspace-command-service"
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
  heartbeatTimer: ReturnType<typeof setInterval> | null
}

export type AgentToolRequest =
  | { type: "workspace.get" }
  | {
      type: "workspace.project"
      scopeSectionEventId: string | null
      mode: TargetProjectionMode
      asOfRevision?: number
    }
  | {
      type: "workspace.command"
      expectedRevision: number
      idempotencyKey: string
      command: unknown
    }
  | { type: "place.search"; requestId: string; input: unknown }
  | { type: "place.resolve"; requestId: string; input: unknown }
  | {
      type: "place.resolve_for_journey_event"
      requestId: string
      input: unknown
    }
  | { type: "place.enrich"; requestId: string; input: unknown }

type PlaceAgentToolRequest = Extract<
  AgentToolRequest,
  { type: `place.${string}` }
>

function isPlaceToolRequest(
  request: AgentToolRequest
): request is PlaceAgentToolRequest {
  return request.type.startsWith("place.")
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
    try {
      await appendWorkspaceMessage(context, workspaceId, {
        role: "USER",
        content: prompt,
      })
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
        // Preserve the original persistence failure. The expired lease is
        // reclaimable by the next runtime even if terminalization also fails.
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
      heartbeatTimer: null,
    }
    this.runs.set(workspaceId, running)
    this.runsByCapability.set(capabilityToken, running)
    this.startHeartbeat(running)

    try {
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
            running.stdout += text
            this.heartbeatInBackground(running)
            emit(workspaceId, {
              type: "agent.message.delta",
              payload: { runId: running.runId, stream: "stdout", text },
            })
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
    request: AgentToolRequest
  ): Promise<unknown>
  async executeTool(capabilityToken: string, request: AgentToolRequest) {
    const running = this.runsByCapability.get(capabilityToken)
    if (!running || running.finished) {
      throw new WorkspaceInputError(
        "Agent tool capability is invalid or expired"
      )
    }
    await this.heartbeat(running)
    if (request.type === "workspace.get") {
      const document = await this.commands.getDocument(
        running.context,
        running.workspaceId
      )
      if (!document) throw new WorkspaceInputError("Workspace was not found")
      return { workspace: document }
    }
    if (request.type === "workspace.project") {
      const document = await this.commands.getDocument(
        running.context,
        running.workspaceId
      )
      if (!document) throw new WorkspaceInputError("Workspace was not found")
      return {
        projection: resolveJourneyProjection({
          graph: document.session.headGraph,
          scopeSectionEventId: request.scopeSectionEventId,
          mode: request.mode,
          asOfRevision: request.asOfRevision,
        }),
        headWorkspaceRevision: document.session.headWorkspaceRevision,
      }
    }
    if (isPlaceToolRequest(request)) {
      return this.executePlaceTool(running, request)
    }
    const envelope: TargetCommandEnvelope = {
      aggregateId: running.workspaceId,
      expectedRevision: request.expectedRevision,
      idempotencyKey: request.idempotencyKey,
      actor: { kind: "AGENT", agentRunId: running.runId },
      command: targetCommandBodySchema.parse(request.command),
    }
    const result = await this.commands.execute(running.context, envelope)
    const document = await this.commands.getDocument(
      running.context,
      running.workspaceId
    )
    return { result, workspace: document }
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
      return this.placeService.searchPlaces(input, usageContext)
    }
    if (request.type === "place.resolve") {
      const input = withoutRequestId(
        placeResolveInputSchema.parse({
          ...asInputRecord(request.input),
          requestId: request.requestId,
        })
      )
      return this.placeService.resolvePlace(input, usageContext)
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
    return this.placeService.resolvePlaceForJourneyEvent(
      input,
      event.type,
      usageContext
    )
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

    let failed = running.runtimeFailed || result.code !== 0
    try {
      if (running.stdout) {
        await appendWorkspaceMessage(running.context, running.workspaceId, {
          role: "ASSISTANT",
          content: running.stdout,
          agentRunId: running.runId,
        })
      }
      if (mode === "suggest" && result.code === 0 && !running.cancelled) {
        const suggestion = parseSuggestion(running.stdout)
        await createWorkspaceSuggestion(running.context, running.workspaceId, {
          title: suggestion.title,
          summary: suggestion.summary,
          commandPayloads: suggestion.commandPayloads,
          basedOnWorkspaceRevision: suggestion.basedOnWorkspaceRevision,
        })
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
          status: running.cancelled
            ? "CANCELLED"
            : failed
              ? "FAILED"
              : "SUCCEEDED",
          errorCode: failed ? "AGENT_RUNTIME_FAILED" : undefined,
          runtimeOwnerId: this.runtimeOwnerId,
          now: this.now(),
        }
      )
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
      type: running.cancelled
        ? "agent.run.cancelled"
        : failed
          ? "agent.run.failed"
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
