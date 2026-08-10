import { EventEmitter } from "node:events"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { PassThrough } from "node:stream"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { AgentRuntimeObserver } from "@/backend/agent/runtime"

const childProcessMock = vi.hoisted(() => ({ spawn: vi.fn() }))

vi.mock("node:child_process", () => ({
  ...childProcessMock,
  default: childProcessMock,
}))

import { KimiCodeRuntime } from "@/backend/agent/runtimes/kimi-code-runtime"

function childProcess() {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  })
}

const observer: AgentRuntimeObserver = {
  onStdout: vi.fn(),
  onStderr: vi.fn(),
  onError: vi.fn(),
  onExit: vi.fn(),
}

describe("KimiCodeRuntime", () => {
  beforeEach(() => {
    childProcessMock.spawn.mockReset()
  })

  it("allows WebSearch only for Auto runs and removes inherited coding tools", async () => {
    const identityHome = await mkdtemp(join(tmpdir(), "periplus-kimi-id-"))
    await mkdir(identityHome, { recursive: true })
    await writeFile(
      join(identityHome, "config.toml"),
      [
        "[model]",
        'model = "test-model"',
        "",
        "[tools]",
        'enabled = ["Read", "Grep", "Glob", "Shell", "mcp__other__*"]',
        "",
        "[display]",
        'theme = "dark"',
        "",
      ].join("\n")
    )
    childProcessMock.spawn.mockReturnValue(childProcess())
    const runtime = new KimiCodeRuntime({
      binary: "/test/kimi",
      identityHomeSource: identityHome,
    })

    const autoRun = await runtime.start(
      {
        runId: "auto-run",
        prompt: "plan",
        toolServers: [
          {
            id: "periplus-workspace",
            command: "tsx",
            args: ["backend/mcp/server.ts"],
            cwd: process.cwd(),
          },
        ],
      },
      observer
    )
    const autoConfig = await readFile(
      join(autoRun.metadata.workDir!, "kimi-home", "config.toml"),
      "utf8"
    )
    expect(autoConfig).toContain(
      'enabled = ["WebSearch", "mcp__periplus-workspace__*"]'
    )
    expect(autoConfig).not.toContain('"Read"')
    expect(autoConfig).not.toContain('"Shell"')
    expect(autoConfig).not.toContain("mcp__other__*")
    expect(autoConfig).toContain('[display]\ntheme = "dark"')

    childProcessMock.spawn.mockReturnValue(childProcess())
    const suggestRun = await runtime.start(
      { runId: "suggest-run", prompt: "suggest", toolServers: [] },
      observer
    )
    const suggestConfig = await readFile(
      join(suggestRun.metadata.workDir!, "kimi-home", "config.toml"),
      "utf8"
    )
    expect(suggestConfig).toContain('enabled = ["mcp__periplus-workspace__*"]')
    expect(suggestConfig).not.toContain('"WebSearch"')
    expect(suggestConfig).not.toContain('"Read"')

    await rm(autoRun.metadata.workDir!, { recursive: true, force: true })
    await rm(suggestRun.metadata.workDir!, { recursive: true, force: true })
    await rm(identityHome, { recursive: true, force: true })
  })
})
