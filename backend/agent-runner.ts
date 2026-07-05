import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { randomUUID } from "node:crypto"
import { copyFile, mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { periplusServerConfig } from "@/config/periplus.server"
import { DraftStore } from "./draft-store"
import type { AgentConversationMessage, AgentEventEmitter } from "./types"

interface AgentRunnerOptions {
  backendUrl: string
  projectRoot: string
}

interface RunningAgent {
  runId: string
  process: ChildProcessWithoutNullStreams
  cancelled: boolean
  workDir: string
}

async function copyKimiIdentity(kimiHome: string) {
  const sourceHome =
    periplusServerConfig.kimi.homeSource ?? join(homedir(), ".kimi-code")
  await mkdir(kimiHome, { recursive: true })

  for (const fileName of ["config.toml", "tui.toml", "device_id"]) {
    await copyFile(join(sourceHome, fileName), join(kimiHome, fileName)).catch(
      () => undefined
    )
  }
}

function formatConversationMessage(message: AgentConversationMessage) {
  return `${message.role === "user" ? "用户" : "Agent"}：\n${message.content}`
}

export function buildPrompt(messages: AgentConversationMessage[]) {
  return [
    "你是 Periplus 的路线规划 Agent。",
    "只能通过 MCP 工具读取和修改当前草稿，不要读写项目文件，不要直接连接数据库。",
    "所有路线修改都应该作用于当前草稿；保存由用户在前端触发。",
    "下面是当前会话从开始到现在的完整上下文，请基于历史继续对话，只执行最后一条用户需求。",
    "",
    "完整对话：",
    messages.map(formatConversationMessage).join("\n\n"),
  ].join("\n")
}

export class AgentRunner {
  private readonly runs = new Map<string, RunningAgent>()

  constructor(
    private readonly store: DraftStore,
    private readonly options: AgentRunnerOptions
  ) {}

  async start(sessionId: string, prompt: string, emit: AgentEventEmitter) {
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
    const workDir = join("/tmp", `periplus-agent-${randomUUID()}`)
    const kimiHome = join(workDir, "kimi-home")
    const draftMcpConfigPath = join(workDir, "draft-mcp-config.json")
    await mkdir(workDir, { recursive: true })
    await copyKimiIdentity(kimiHome)
    await writeFile(
      draftMcpConfigPath,
      JSON.stringify(
        {
          backendUrl: this.options.backendUrl,
          sessionId,
        },
        null,
        2
      )
    )
    await writeFile(
      join(kimiHome, "mcp.json"),
      JSON.stringify(
        {
          mcpServers: {
            "periplus-draft": {
              command: join(this.options.projectRoot, "node_modules/.bin/tsx"),
              args: ["backend/mcp/server.ts", "--config", draftMcpConfigPath],
              cwd: this.options.projectRoot,
            },
          },
        },
        null,
        2
      )
    )

    this.store.lock(sessionId, runId)
    emit(sessionId, {
      type: "draft.locked",
      payload: this.store.getSnapshot(sessionId),
    })
    emit(sessionId, { type: "agent.run.started", payload: { runId } })

    const child = spawn(
      periplusServerConfig.kimi.bin,
      ["-p", buildPrompt(conversationMessages)],
      {
        cwd: workDir,
        env: {
          ...process.env,
          KIMI_CODE_HOME: kimiHome,
        },
      }
    )
    const running: RunningAgent = {
      runId,
      process: child,
      cancelled: false,
      workDir,
    }
    this.runs.set(sessionId, running)

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8")
      this.store.appendAssistantConversationDelta(sessionId, runId, text)
      emit(sessionId, {
        type: "agent.message.delta",
        payload: { runId, stream: "stdout", text },
      })
    })
    child.stderr.on("data", (chunk: Buffer) => {
      emit(sessionId, {
        type: "agent.message.delta",
        payload: { runId, stream: "stderr", text: chunk.toString("utf8") },
      })
    })
    child.on("error", (error) => {
      emit(sessionId, {
        type: "agent.run.failed",
        payload: { runId, message: error.message },
      })
    })
    child.on("close", (code) => {
      this.runs.delete(sessionId)
      this.store.unlock(sessionId, runId)
      emit(sessionId, {
        type: "draft.unlocked",
        payload: this.store.getSnapshot(sessionId),
      })
      emit(sessionId, {
        type: running.cancelled
          ? "agent.run.cancelled"
          : code === 0
            ? "agent.run.completed"
            : "agent.run.failed",
        payload: { runId, code, workDir },
      })
    })
  }

  cancel(sessionId: string) {
    const running = this.runs.get(sessionId)
    if (!running) return

    running.cancelled = true
    running.process.kill("SIGTERM")
  }
}
