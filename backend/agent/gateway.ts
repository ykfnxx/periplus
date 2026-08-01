import { randomUUID } from "node:crypto"
import { join } from "node:path"
import type { AuthContext } from "@/modules/auth/server/context"
import {
  targetCommandBodySchema,
  WORKSPACE_AGENT_RUN_LEASE_SECONDS,
  type TargetCommandEnvelope,
} from "@/modules/data-model/contracts"
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
      type: "workspace.command"
      expectedRevision: number
      idempotencyKey: string
      command: unknown
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
