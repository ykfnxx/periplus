import { spawn } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { StringDecoder } from "node:string_decoder"
import type {
  AgentRuntime,
  AgentRuntimeObserver,
  AgentRuntimeRequest,
  AgentRuntimeRun,
  AgentToolServer,
} from "../runtime"

const PERIPLUS_TOOL_NAMES = [
  "periplus_workspace_get",
  "periplus_workspace_project",
  "periplus_workspace_validate_plan",
  "periplus_workspace_validate_draft",
  "periplus_workspace_commit_draft",
  "periplus_workspace_prepare_transit",
  "periplus_place_search",
  "periplus_place_resolve",
  "periplus_place_resolve_for_journey_event",
  "periplus_place_enrich",
  "periplus_hotel_search",
] as const

const PI_TOOL_NAME_MAP = [
  ["periplus.workspace.get", "periplus_workspace_get"],
  ["periplus.workspace.project", "periplus_workspace_project"],
  ["periplus.workspace.validate_plan", "periplus_workspace_validate_plan"],
  ["periplus.workspace.validate_draft", "periplus_workspace_validate_draft"],
  ["periplus.workspace.commit_draft", "periplus_workspace_commit_draft"],
  ["periplus.workspace.prepare_transit", "periplus_workspace_prepare_transit"],
  ["periplus.place.search", "periplus_place_search"],
  [
    "periplus.place.resolve_for_journey_event",
    "periplus_place_resolve_for_journey_event",
  ],
  ["periplus.place.resolve", "periplus_place_resolve"],
  ["periplus.place.enrich", "periplus_place_enrich"],
  ["periplus.hotel.search", "periplus_hotel_search"],
] as const

interface PiRuntimeOptions {
  binary: string
  projectRoot: string
  apiKey: string
  model: string
  webSearchEnabled: boolean
  timeoutMs: number
}

interface WorkspaceToolConfig {
  backendUrl: string
  capabilityToken: string
}

interface PiRunConfig {
  backendUrl?: string
  capabilityToken?: string
  model: string
  toolNames: string[]
  webSearchEnabled: boolean
  maxWebSearches: number
}

function workspaceToolConfig(
  toolServers: AgentToolServer[]
): WorkspaceToolConfig | null {
  const server = toolServers.find(
    (candidate) => candidate.id === "periplus-workspace"
  )
  if (!server?.configFile) return null
  return JSON.parse(server.configFile.content) as WorkspaceToolConfig
}

function piPrompt(prompt: string) {
  return PI_TOOL_NAME_MAP.reduce(
    (next, [from, to]) => next.replaceAll(from, to),
    prompt
  )
}

function modelsConfig(model: string) {
  return {
    providers: {
      deepseek: {
        baseUrl: "https://api.deepseek.com",
        apiKey: "$DEEPSEEK_API_KEY",
        models: [
          {
            id: model,
            name: "DeepSeek Responses",
            api: "openai-responses",
            contextWindow: 1000000,
            maxTokens: 32768,
            input: ["text"],
            reasoning: true,
            thinkingLevelMap: {
              off: null,
              minimal: null,
              low: null,
              medium: null,
              high: "high",
              xhigh: null,
              max: "max",
            },
          },
        ],
      },
    },
  }
}

function redact(text: string, secrets: string[]) {
  return secrets.reduce(
    (value, secret) =>
      secret ? value.replaceAll(secret, "[REDACTED]") : value,
    text
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export class PiRuntime implements AgentRuntime {
  readonly id = "pi"

  constructor(private readonly options: PiRuntimeOptions) {}

  async start(
    request: AgentRuntimeRequest,
    observer: AgentRuntimeObserver
  ): Promise<AgentRuntimeRun> {
    if (!this.options.apiKey) {
      throw new Error("DEEPSEEK_API_KEY is required for the Pi runtime")
    }

    const workDir = await mkdtemp(join(tmpdir(), "periplus-pi-"))
    const agentDir = join(workDir, "pi-agent")
    const runConfigPath = join(workDir, "periplus-pi-run.json")
    await mkdir(agentDir, { recursive: true })

    const workspace = workspaceToolConfig(request.toolServers)
    const runConfig: PiRunConfig = {
      backendUrl: workspace?.backendUrl,
      capabilityToken: workspace?.capabilityToken,
      model: this.options.model,
      toolNames: workspace ? [...PERIPLUS_TOOL_NAMES] : [],
      webSearchEnabled: Boolean(workspace && this.options.webSearchEnabled),
      maxWebSearches: 3,
    }
    await writeFile(
      join(agentDir, "models.json"),
      JSON.stringify(modelsConfig(this.options.model), null, 2),
      { mode: 0o600 }
    )
    await writeFile(runConfigPath, JSON.stringify(runConfig), { mode: 0o600 })

    const metadata = { runtimeId: this.id, workDir }
    const child = spawn(
      this.options.binary,
      [
        "--mode",
        "rpc",
        "--no-session",
        "--provider",
        "deepseek",
        "--model",
        this.options.model,
        "--thinking",
        "high",
        "--no-builtin-tools",
        "--no-context-files",
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        "--no-extensions",
        "--extension",
        join(
          this.options.projectRoot,
          "backend/agent/pi-extension/periplus-runtime-extension.ts"
        ),
      ],
      {
        cwd: workDir,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          NODE_ENV: process.env.NODE_ENV ?? "production",
          PATH: process.env.PATH,
          HOME: agentDir,
          PI_CODING_AGENT_DIR: agentDir,
          PERIPLUS_PI_RUN_CONFIG: runConfigPath,
          DEEPSEEK_API_KEY: this.options.apiKey,
        },
      }
    )

    const secrets = [this.options.apiKey, runConfig.capabilityToken ?? ""]
    let settled = false
    let reportedError = false
    let abortRequested = false
    let closed = false
    let terminateTimer: ReturnType<typeof setTimeout> | null = null
    let killTimer: ReturnType<typeof setTimeout> | null = null
    const timeoutTimer = setTimeout(() => {
      reportError(new Error("Pi runtime timed out"))
      requestAbort()
    }, this.options.timeoutMs)
    timeoutTimer.unref?.()

    const clearTimers = () => {
      clearTimeout(timeoutTimer)
      if (terminateTimer) clearTimeout(terminateTimer)
      if (killTimer) clearTimeout(killTimer)
    }

    const reportError = (error: Error) => {
      if (reportedError) return
      reportedError = true
      observer.onError(new Error(redact(error.message, secrets)))
    }

    const send = (message: Record<string, unknown>) => {
      if (child.stdin.destroyed || !child.stdin.writable) return
      child.stdin.write(`${JSON.stringify(message)}\n`)
    }

    const requestAbort = () => {
      if (abortRequested || closed) return
      abortRequested = true
      send({ type: "abort" })
      terminateTimer = setTimeout(() => child.kill("SIGTERM"), 2000)
      killTimer = setTimeout(() => child.kill("SIGKILL"), 4000)
    }

    const handleRpcRecord = (record: Record<string, unknown>) => {
      if (
        record.type === "message_update" &&
        isRecord(record.assistantMessageEvent) &&
        record.assistantMessageEvent.type === "text_delta" &&
        typeof record.assistantMessageEvent.delta === "string"
      ) {
        observer.onStdout(record.assistantMessageEvent.delta)
        return
      }
      if (record.type === "agent_settled") {
        settled = true
        child.stdin.end()
        return
      }
      if (record.type === "extension_error") {
        reportError(new Error("Pi extension failed"))
        return
      }
      if (record.type === "response" && record.success === false) {
        reportError(
          new Error(
            typeof record.error === "string" ? record.error : "Pi RPC failed"
          )
        )
        if (record.command === "prompt") requestAbort()
      }
    }

    const decoder = new StringDecoder("utf8")
    let buffer = ""
    const readRecords = (chunk: Buffer | string) => {
      buffer += typeof chunk === "string" ? chunk : decoder.write(chunk)
      while (true) {
        const newlineIndex = buffer.indexOf("\n")
        if (newlineIndex < 0) return
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        if (line.endsWith("\r")) {
          reportError(new Error("Pi RPC must use LF-delimited JSON"))
          requestAbort()
          return
        }
        if (!line) continue
        try {
          const record = JSON.parse(line) as unknown
          if (!isRecord(record))
            throw new Error("Pi RPC record was not an object")
          handleRpcRecord(record)
        } catch {
          reportError(new Error("Pi RPC emitted invalid JSON"))
          requestAbort()
        }
      }
    }

    child.stdout.on("data", readRecords)
    child.stdout.on("end", () => {
      buffer += decoder.end()
      if (buffer.trim()) {
        try {
          const record = JSON.parse(buffer) as unknown
          if (!isRecord(record))
            throw new Error("Pi RPC record was not an object")
          handleRpcRecord(record)
        } catch {
          reportError(new Error("Pi RPC emitted invalid JSON"))
        }
      }
    })
    child.stderr.on("data", (chunk: Buffer) => {
      observer.onStderr(redact(chunk.toString("utf8"), secrets))
    })
    child.on("error", (error) => reportError(error))
    child.on("close", (code) => {
      if (closed) return
      closed = true
      clearTimers()
      if (!settled && !abortRequested) {
        reportError(new Error("Pi exited before agent_settled"))
      }
      void rm(workDir, { recursive: true, force: true }).finally(() => {
        observer.onExit({
          code: settled ? (code ?? 0) : (code ?? 1),
          metadata,
        })
      })
    })

    send({
      id: request.runId,
      type: "prompt",
      message: piPrompt(request.prompt),
    })

    return {
      metadata,
      cancel: requestAbort,
    }
  }
}
