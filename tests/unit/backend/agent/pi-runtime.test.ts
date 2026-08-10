import { EventEmitter } from "node:events"
import { existsSync, readFileSync } from "node:fs"
import { PassThrough } from "node:stream"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type {
  AgentRuntimeObserver,
  AgentToolServer,
} from "@/backend/agent/runtime"

const childProcessMock = vi.hoisted(() => ({ spawn: vi.fn() }))

vi.mock("node:child_process", () => ({
  ...childProcessMock,
  default: childProcessMock,
}))

import { PiRuntime } from "@/backend/agent/runtimes/pi-runtime"

function createChild({ settle = true } = {}) {
  const commands: string[] = []
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
    commands,
  })
  child.stdin.on("data", (chunk: Buffer) => {
    commands.push(chunk.toString("utf8"))
    if (!settle) return
    queueMicrotask(() => {
      child.stdout.write(
        `${JSON.stringify({
          type: "message_update",
          assistantMessageEvent: { type: "text_delta", delta: "Pi reply" },
        })}\n`
      )
      child.stdout.write(`${JSON.stringify({ type: "agent_settled" })}\n`)
    })
  })
  child.stdin.on("finish", () => {
    queueMicrotask(() => child.emit("close", 0))
  })
  return child
}

function workspaceToolServerFor(capabilityToken: string): AgentToolServer {
  return {
    ...workspaceToolServer,
    configFile: {
      ...workspaceToolServer.configFile!,
      content: JSON.stringify({
        backendUrl: "http://127.0.0.1:3002",
        capabilityToken,
      }),
    },
  }
}

function startObserver() {
  let resolveExit: (() => void) | undefined
  const finished = new Promise<void>((resolve) => {
    resolveExit = resolve
  })
  const observer: AgentRuntimeObserver = {
    onStdout: vi.fn(),
    onStderr: vi.fn(),
    onError: vi.fn(),
    onExit: vi.fn(() => resolveExit?.()),
  }
  return { observer, finished }
}

const workspaceToolServer: AgentToolServer = {
  id: "periplus-workspace",
  command: "tsx",
  args: ["backend/mcp/server.ts"],
  cwd: process.cwd(),
  configFile: {
    fileName: "workspace-mcp-config.json",
    argument: "--config",
    content: JSON.stringify({
      backendUrl: "http://127.0.0.1:3002",
      capabilityToken: "capability-token",
    }),
  },
}

describe("PiRuntime", () => {
  beforeEach(() => {
    childProcessMock.spawn.mockReset()
  })

  it("runs Pi in isolated RPC mode and maps the settled stream", async () => {
    const child = createChild()
    childProcessMock.spawn.mockReturnValue(child)
    const runtime = new PiRuntime({
      binary: "/test/pi",
      projectRoot: process.cwd(),
      apiKey: "deepseek-key",
      model: "deepseek-v4-flash",
      webSearchEnabled: true,
      timeoutMs: 1000,
    })
    const { observer, finished } = startObserver()

    const run = await runtime.start(
      {
        runId: "run-1",
        prompt:
          "Call periplus.workspace.get_context before periplus.draft.open and periplus.draft.commit.",
        toolServers: [workspaceToolServer],
      },
      observer
    )
    const [, args, options] = childProcessMock.spawn.mock.calls[0] as [
      string,
      string[],
      { env: Record<string, string> },
    ]
    const command = JSON.parse(child.commands[0] ?? "{}") as {
      message?: string
    }
    const runConfig = JSON.parse(
      readFileSync(options.env.PERIPLUS_PI_RUN_CONFIG, "utf8")
    ) as {
      model: string
      toolNames: string[]
      webSearchEnabled: boolean
      maxWebSearches: number
    }

    expect(args).toEqual(
      expect.arrayContaining([
        "--mode",
        "rpc",
        "--no-session",
        "--no-builtin-tools",
        "--extension",
      ])
    )
    expect(options.env).not.toHaveProperty("PI_PACKAGE_DIR")
    expect(command.message).toContain("periplus_workspace_get_context")
    expect(command.message).toContain("periplus_draft_open")
    expect(command.message).toContain("periplus_draft_commit")
    expect(runConfig.toolNames).not.toContain("periplus_workspace_command")
    expect(runConfig.toolNames).toContain("periplus_draft_validate")
    expect(runConfig.toolNames).toContain("periplus_draft_commit")
    expect(runConfig.toolNames).toContain("periplus_draft_prepare_transit")
    expect(runConfig.toolNames).toContain("periplus_place_fallback")
    expect(runConfig.toolNames).not.toContain(
      "periplus_workspace_validate_draft"
    )
    expect(runConfig).toMatchObject({
      model: "deepseek-v4-flash",
      webSearchEnabled: true,
      maxWebSearches: 3,
    })

    await finished

    expect(observer.onStdout).toHaveBeenCalledWith("Pi reply")
    expect(observer.onError).not.toHaveBeenCalled()
    expect(observer.onExit).toHaveBeenCalledWith({
      code: 0,
      metadata: run.metadata,
    })
    expect(existsSync(run.metadata.workDir ?? "")).toBe(false)
  })

  it("keeps concurrent run capabilities separate and cleans each cancelled child", async () => {
    const firstChild = createChild({ settle: false })
    const secondChild = createChild({ settle: false })
    childProcessMock.spawn
      .mockReturnValueOnce(firstChild)
      .mockReturnValueOnce(secondChild)
    const runtime = new PiRuntime({
      binary: "/test/pi",
      projectRoot: process.cwd(),
      apiKey: "deepseek-key",
      model: "deepseek-v4-flash",
      webSearchEnabled: false,
      timeoutMs: 1000,
    })
    const first = startObserver()
    const second = startObserver()

    const [firstRun, secondRun] = await Promise.all([
      runtime.start(
        {
          runId: "run-first",
          prompt: "first",
          toolServers: [workspaceToolServerFor("capability-first")],
        },
        first.observer
      ),
      runtime.start(
        {
          runId: "run-second",
          prompt: "second",
          toolServers: [workspaceToolServerFor("capability-second")],
        },
        second.observer
      ),
    ])
    const calls = childProcessMock.spawn.mock.calls as Array<
      [string, string[], { env: Record<string, string> }]
    >
    const runConfigs = new Map(
      [firstChild, secondChild].map((child, index) => {
        const prompt = JSON.parse(child.commands[0] ?? "{}") as {
          id: string
        }
        const [, , options] = calls[index]
        return [
          prompt.id,
          JSON.parse(
            readFileSync(options.env.PERIPLUS_PI_RUN_CONFIG, "utf8")
          ) as { capabilityToken: string },
        ]
      })
    )

    expect(runConfigs.get("run-first")?.capabilityToken).toBe(
      "capability-first"
    )
    expect(runConfigs.get("run-second")?.capabilityToken).toBe(
      "capability-second"
    )

    firstRun.cancel()
    secondRun.cancel()
    expect(firstChild.commands.at(-1)).toContain('"type":"abort"')
    expect(secondChild.commands.at(-1)).toContain('"type":"abort"')

    firstChild.emit("close", 143)
    secondChild.emit("close", 143)
    await Promise.all([first.finished, second.finished])

    expect(existsSync(firstRun.metadata.workDir ?? "")).toBe(false)
    expect(existsSync(secondRun.metadata.workDir ?? "")).toBe(false)
  })

  it("reports an abnormal exit and removes the temporary run directory", async () => {
    const child = createChild({ settle: false })
    childProcessMock.spawn.mockReturnValue(child)
    const runtime = new PiRuntime({
      binary: "/test/pi",
      projectRoot: process.cwd(),
      apiKey: "deepseek-key",
      model: "deepseek-v4-flash",
      webSearchEnabled: false,
      timeoutMs: 1000,
    })
    const { observer, finished } = startObserver()
    const run = await runtime.start(
      {
        runId: "run-failed",
        prompt: "fail",
        toolServers: [],
      },
      observer
    )

    child.emit("close", 1)
    await finished

    expect(observer.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Pi exited before agent_settled" })
    )
    expect(existsSync(run.metadata.workDir ?? "")).toBe(false)
  })

  it("aborts promptly when Pi rejects the prompt before agent_settled", async () => {
    const child = createChild({ settle: false })
    childProcessMock.spawn.mockReturnValue(child)
    const runtime = new PiRuntime({
      binary: "/test/pi",
      projectRoot: process.cwd(),
      apiKey: "deepseek-key",
      model: "deepseek-v4-flash",
      webSearchEnabled: false,
      timeoutMs: 120_000,
    })
    const { observer, finished } = startObserver()
    const run = await runtime.start(
      { runId: "run-rejected", prompt: "rejected", toolServers: [] },
      observer
    )

    child.stdout.write(
      `${JSON.stringify({
        type: "response",
        command: "prompt",
        success: false,
        error: "prompt preflight rejected",
      })}\n`
    )

    expect(observer.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "prompt preflight rejected" })
    )
    expect(child.commands.at(-1)).toContain('"type":"abort"')

    child.emit("close", 1)
    await finished
    expect(existsSync(run.metadata.workDir ?? "")).toBe(false)
  })

  it("aborts a timed-out run and cleans it after exit", async () => {
    vi.useFakeTimers()
    try {
      const child = createChild({ settle: false })
      childProcessMock.spawn.mockReturnValue(child)
      const runtime = new PiRuntime({
        binary: "/test/pi",
        projectRoot: process.cwd(),
        apiKey: "deepseek-key",
        model: "deepseek-v4-flash",
        webSearchEnabled: false,
        timeoutMs: 10,
      })
      const { observer, finished } = startObserver()
      const run = await runtime.start(
        {
          runId: "run-timeout",
          prompt: "timeout",
          toolServers: [],
        },
        observer
      )

      await vi.advanceTimersByTimeAsync(10)
      expect(observer.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: "Pi runtime timed out" })
      )
      expect(child.commands.at(-1)).toContain('"type":"abort"')

      child.emit("close", 143)
      await finished
      expect(existsSync(run.metadata.workDir ?? "")).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it("rejects CRLF RPC output", async () => {
    const child = createChild({ settle: false })
    childProcessMock.spawn.mockReturnValue(child)
    const runtime = new PiRuntime({
      binary: "/test/pi",
      projectRoot: process.cwd(),
      apiKey: "deepseek-key",
      model: "deepseek-v4-flash",
      webSearchEnabled: false,
      timeoutMs: 1000,
    })
    const { observer, finished } = startObserver()
    await runtime.start(
      { runId: "run-crlf", prompt: "invalid", toolServers: [] },
      observer
    )

    child.stdout.write(`${JSON.stringify({ type: "agent_settled" })}\r\n`)
    expect(observer.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Pi RPC must use LF-delimited JSON" })
    )
    expect(child.commands.at(-1)).toContain('"type":"abort"')

    child.emit("close", 1)
    await finished
  })
})
