import { afterEach, describe, expect, it, vi } from "vitest"

const generateSummaryWithUsage = vi.hoisted(() => vi.fn())

vi.mock("@earendil-works/pi-agent-core", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@earendil-works/pi-agent-core")>()
  return { ...actual, generateSummaryWithUsage }
})

import {
  PeriplusAgentHarness,
  type PeriplusHarnessEvent,
} from "@/backend/agent/periplus-agent-harness"

afterEach(() => vi.clearAllMocks())

describe("Pi core context compaction cancellation", () => {
  it("returns a cancel handle before compacting and never saves its checkpoint", async () => {
    let markCompactionStarted!: () => void
    const compactionStarted = new Promise<void>((resolve) => {
      markCompactionStarted = resolve
    })
    generateSummaryWithUsage.mockImplementation(
      (
        _messages: unknown,
        _models: unknown,
        _model: unknown,
        _reserveTokens: unknown,
        signal: AbortSignal
      ) =>
        new Promise((_, reject) => {
          markCompactionStarted()
          signal.addEventListener(
            "abort",
            () =>
              reject(
                Object.assign(new Error("cancelled"), { name: "AbortError" })
              ),
            { once: true }
          )
        })
    )
    const saveCheckpoint = vi.fn()
    const events: PeriplusHarnessEvent[] = []
    const harness = new PeriplusAgentHarness({
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      webSearchEnabled: false,
      timeoutMs: 30_000,
    })

    const run = harness.start(
      {
        runId: "compact-cancel",
        workspaceId: "workspace-1",
        mode: "auto",
        systemPrompt: "plan",
        messages: [
          {
            id: "large-user-message",
            role: "user",
            content: "x".repeat(4_000_000),
            createdAt: "2026-08-13T00:00:00.000Z",
          },
        ],
        checkpoint: null,
        executeTool: vi.fn(),
        saveCheckpoint,
      },
      { onEvent: (event) => events.push(event) }
    )

    await compactionStarted
    run.cancel()
    await vi.waitFor(() =>
      expect(events).toContainEqual({
        type: "run_end",
        result: { status: "cancelled" },
      })
    )

    expect(saveCheckpoint).not.toHaveBeenCalled()
    expect(events).toContainEqual(
      expect.objectContaining({
        type: "model_end",
        requestId: "compact-cancel:compaction",
        stopReason: "aborted",
      })
    )
    expect(
      events.some(
        (event) =>
          event.type === "model_start" &&
          event.requestId === "compact-cancel:model:0"
      )
    ).toBe(false)
  })
})
