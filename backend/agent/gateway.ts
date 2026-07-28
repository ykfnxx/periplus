import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { DraftSessionService } from "@/modules/workspace/server/draft-session-service"
import type {
  AgentEventEmitter,
  AgentMode,
  AgentConversationMessage,
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
}

interface RunningAgent {
  runId: string
  runtimeRun: AgentRuntimeRun | null
  cancelled: boolean
  finished: boolean
  runtimeFailed: boolean
  stdout: string
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

  constructor(
    private readonly store: DraftSessionService,
    private readonly runtime: AgentRuntime,
    private readonly options: AgentGatewayOptions
  ) {}

  async start(
    sessionId: string,
    prompt: string,
    mode: AgentMode,
    emit: AgentEventEmitter
  ) {
    if (this.runs.has(sessionId) || this.store.isLocked(sessionId)) {
      emit(sessionId, {
        type: "error",
        payload: { message: "当前草稿正在由 Agent 修改" },
      })
      return
    }

    const runId = `run-${randomUUID()}`
    this.store.addUserConversationMessage(sessionId, prompt)
    const conversationMessages = this.store.getConversationMessages(sessionId)
    const snapshot = this.store.getSnapshot(sessionId)
    const running: RunningAgent = {
      runId,
      runtimeRun: null,
      cancelled: false,
      finished: false,
      runtimeFailed: false,
      stdout: "",
    }

    this.runs.set(sessionId, running)
    this.store.lock(sessionId, runId)
    emit(sessionId, {
      type: "draft.locked",
      payload: this.store.getSnapshot(sessionId),
    })
    emit(sessionId, {
      type: "agent.run.started",
      payload: { runId, runtimeId: this.runtime.id },
    })

    try {
      const runtimeRun = await this.runtime.start(
        {
          runId,
          prompt: draftPrompt(conversationMessages, mode, snapshot),
          toolServers: this.toolServers(sessionId, mode),
        },
        {
          onStdout: (text) => {
            running.stdout += text
            this.store.appendAssistantConversationDelta(sessionId, runId, text)
            emit(sessionId, {
              type: "agent.message.delta",
              payload: { runId, stream: "stdout", text },
            })
          },
          onStderr: (text) => {
            emit(sessionId, {
              type: "agent.message.delta",
              payload: { runId, stream: "stderr", text },
            })
          },
          onError: (error) => {
            running.runtimeFailed = true
            emit(sessionId, {
              type: "agent.run.failed",
              payload: { runId, message: error.message },
            })
          },
          onExit: (result) => {
            this.finish(sessionId, running, mode, result, emit)
          },
        }
      )

      running.runtimeRun = runtimeRun
      if (running.cancelled) runtimeRun.cancel()
    } catch (error) {
      this.failToStart(sessionId, running, error, emit)
    }
  }

  cancel(sessionId: string) {
    const running = this.runs.get(sessionId)
    if (!running || running.finished) return

    running.cancelled = true
    running.runtimeRun?.cancel()
  }

  private toolServers(sessionId: string, mode: AgentMode): AgentToolServer[] {
    if (mode !== "auto") return []

    return [
      {
        id: "periplus-draft",
        command: join(this.options.projectRoot, "node_modules/.bin/tsx"),
        args: ["backend/mcp/server.ts"],
        cwd: this.options.projectRoot,
        configFile: {
          fileName: "draft-mcp-config.json",
          argument: "--config",
          content: JSON.stringify(
            {
              backendUrl: this.options.backendUrl,
              sessionId,
            },
            null,
            2
          ),
        },
      },
    ]
  }

  private finish(
    sessionId: string,
    running: RunningAgent,
    mode: AgentMode,
    result: AgentRuntimeExit,
    emit: AgentEventEmitter
  ) {
    if (running.finished) return
    running.finished = true
    this.runs.delete(sessionId)

    let failed = running.runtimeFailed || result.code !== 0
    if (mode === "suggest" && result.code === 0 && !running.cancelled) {
      try {
        const suggestion = this.store.createSuggestion(
          sessionId,
          parseSuggestion(running.stdout)
        )
        emit(sessionId, {
          type: "agent.diff.suggested",
          payload: suggestion.pendingSuggestions[0] ?? null,
        })
        emit(sessionId, {
          type: "draft.updated",
          payload: suggestion,
        })
      } catch (error) {
        failed = true
        emit(sessionId, {
          type: "agent.run.failed",
          payload: {
            runId: running.runId,
            message:
              error instanceof Error
                ? error.message
                : "Suggestion parse failed",
          },
        })
      }
    }

    this.store.unlock(sessionId, running.runId)
    emit(sessionId, {
      type: "draft.unlocked",
      payload: this.store.getSnapshot(sessionId),
    })
    emit(sessionId, {
      type: running.cancelled
        ? "agent.run.cancelled"
        : failed
          ? "agent.run.failed"
          : "agent.run.completed",
      payload: {
        runId: running.runId,
        code: result.code,
        ...result.metadata,
      },
    })
  }

  private failToStart(
    sessionId: string,
    running: RunningAgent,
    error: unknown,
    emit: AgentEventEmitter
  ) {
    if (running.finished) return
    running.finished = true
    this.runs.delete(sessionId)
    this.store.unlock(sessionId, running.runId)
    emit(sessionId, {
      type: "draft.unlocked",
      payload: this.store.getSnapshot(sessionId),
    })
    emit(sessionId, {
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
