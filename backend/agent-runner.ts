import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { randomUUID } from "node:crypto"
import { copyFile, mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"
import { periplusServerConfig } from "@/config/periplus.server"
import { DraftStore } from "./draft-store"
import {
  DRAFT_TOOL_NAMES,
  type AgentConversationMessage,
  type AgentEventEmitter,
  type AgentMode,
  type DraftToolName,
  type ToolCallSuggestionCall,
  type ToolCallSuggestionCreateInput,
} from "./types"

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

function basePrompt(messages: AgentConversationMessage[]) {
  return [
    "你是 Periplus 的路线规划 Agent。",
    "所有路线修改都应该作用于当前草稿；保存由用户在前端触发。",
    "下面是当前会话从开始到现在的完整上下文，请基于历史继续对话，只执行最后一条用户需求。",
    "",
    "完整对话：",
    messages.map(formatConversationMessage).join("\n\n"),
  ]
}

export function buildPrompt(
  messages: AgentConversationMessage[],
  mode: AgentMode = "auto",
  draftJson = "{}"
) {
  if (mode === "suggest") {
    return [
      ...basePrompt(messages),
      "",
      "当前模式：Suggest。",
      "禁止调用 MCP 工具，禁止修改草稿。",
      "你只能输出一个 JSON 对象，不能输出 Markdown 代码块以外的解释文字。",
      "JSON 格式：",
      JSON.stringify(
        {
          title: "简短建议标题",
          summary: "给用户看的简短变更摘要",
          toolCalls: [
            {
              tool: "route.update_node",
              input: {
                nodeId: "node-id",
                patch: { notes: "新的备注" },
              },
            },
          ],
        },
        null,
        2
      ),
      "",
      `允许的 tool 值：${DRAFT_TOOL_NAMES.filter(
        (name) => name !== "get_current_draft"
      ).join(", ")}`,
      "",
      "当前草稿快照：",
      draftJson,
    ].join("\n")
  }

  return [
    ...basePrompt(messages),
    "只能通过 MCP 工具读取和修改当前草稿，不要读写项目文件，不要直接连接数据库。",
  ].join("\n")
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null
}

function findJsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) return fenced[1]

  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  return start >= 0 && end > start ? text.slice(start, end + 1) : text
}

function normalizeToolCall(value: unknown): ToolCallSuggestionCall {
  const record = asRecord(value)
  if (!record) throw new Error("Invalid tool call")

  const tool = String(record.tool ?? record.name ?? "")
  if (!DRAFT_TOOL_NAMES.includes(tool as DraftToolName)) {
    throw new Error(`Unsupported suggestion tool: ${tool}`)
  }
  if (tool === "get_current_draft") {
    throw new Error("Suggestion cannot use get_current_draft")
  }

  const input = asRecord(record.input ?? record.arguments ?? {}) ?? {}
  return { tool: tool as DraftToolName, input }
}

function parseSuggestion(text: string): ToolCallSuggestionCreateInput {
  const payload = JSON.parse(findJsonObject(text)) as unknown
  const record = asRecord(payload)
  if (!record) throw new Error("Suggestion output must be a JSON object")

  const rawCalls = record.toolCalls ?? record.tool_calls
  if (!Array.isArray(rawCalls)) {
    throw new Error("Suggestion output must include toolCalls")
  }

  return {
    title: String(record.title ?? "路线修改建议"),
    summary: String(record.summary ?? "Agent 生成了一组待确认的路线修改"),
    toolCalls: rawCalls.map(normalizeToolCall),
  }
}

export class AgentRunner {
  private readonly runs = new Map<string, RunningAgent>()

  constructor(
    private readonly store: DraftStore,
    private readonly options: AgentRunnerOptions
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
    const workDir = join("/tmp", `periplus-agent-${randomUUID()}`)
    const kimiHome = join(workDir, "kimi-home")
    const draftMcpConfigPath = join(workDir, "draft-mcp-config.json")
    await mkdir(workDir, { recursive: true })
    await copyKimiIdentity(kimiHome)

    if (mode === "auto") {
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
                command: join(
                  this.options.projectRoot,
                  "node_modules/.bin/tsx"
                ),
                args: ["backend/mcp/server.ts", "--config", draftMcpConfigPath],
                cwd: this.options.projectRoot,
              },
            },
          },
          null,
          2
        )
      )
    }

    this.store.lock(sessionId, runId)
    emit(sessionId, {
      type: "draft.locked",
      payload: this.store.getSnapshot(sessionId),
    })
    emit(sessionId, { type: "agent.run.started", payload: { runId } })

    const child = spawn(
      periplusServerConfig.kimi.bin,
      [
        "-p",
        buildPrompt(
          conversationMessages,
          mode,
          JSON.stringify(snapshot, null, 2)
        ),
      ],
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
    let stdout = ""

    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8")
      stdout += text
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
      if (mode === "suggest" && code === 0 && !running.cancelled) {
        try {
          const suggestion = this.store.createSuggestion(
            sessionId,
            parseSuggestion(stdout)
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
          emit(sessionId, {
            type: "agent.run.failed",
            payload: {
              runId,
              message:
                error instanceof Error
                  ? error.message
                  : "Suggestion parse failed",
            },
          })
        }
      }
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
